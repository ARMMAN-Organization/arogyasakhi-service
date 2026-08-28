import { conflict, notFound, unprocessable } from '@armman/service-commons';
import type { ClosureRepository } from './closure.repository';
import type { ApprovalClient } from '../reopen-requests/approval.client';
import type { LookupClient } from '../reopen-requests/lookup.client';
import type { NotificationClient } from '../reopen-requests/notification.client';
import type { BeneficiaryClient } from '../reopen-requests/beneficiary.client';
import type { SakhiClient } from '../reopen-requests/sakhi.client';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/**
 * CLOSURE_REASON valueCodes that require Supervisor review before the
 * beneficiary closes — resolved from the server's own read of
 * closureReasonLookupValueId, never from client input (see
 * createClosureSchema's doc comment for the trust gap this closes).
 */
const REASONS_REQUIRING_REVIEW = new Set(['MIGRATION']);

/** Closure domain logic. Data access is delegated to the repository. */
export class ClosureService {
  constructor(
    private readonly repository: ClosureRepository,
    private readonly approvalClient: ApprovalClient,
    private readonly lookupClient: LookupClient,
    private readonly notificationClient: NotificationClient,
    private readonly beneficiaryClient: BeneficiaryClient,
    private readonly sakhiClient: SakhiClient,
  ) {}

  /** Best-effort — a name lookup failure falls back to no name (generic
   * notification text) rather than blocking the decision it's attached to. */
  private async resolveSakhiName(
    sakhiId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    try {
      const sakhi = await this.sakhiClient.getById(sakhiId, authorizationHeader);
      return sakhi?.displayName ?? null;
    } catch (err) {
      console.error(`Failed to resolve Sakhi ${sakhiId}'s name for a notification:`, err);
      return null;
    }
  }

  list() {
    return this.repository.findMany();
  }

  getDecisionStatusByIds(ids: string[]) {
    return this.repository.findManyByIds(ids);
  }

  async getById(id: string) {
    const closure = await this.repository.findById(id);
    if (!closure) throw notFound('Closure not found.');
    return closure;
  }

  /**
   * Idempotent replay: a dropped-connection retry of a Sakhi's closure
   * submission resubmits the same client-generated localClosureUuid. Return
   * the original closure unchanged instead of creating a duplicate row or
   * re-firing the Quick Response card / beneficiary-close side effects below
   * a second time — this mobile flow is offline-first and expected to retry.
   *
   * supervisorStatus is derived here from the server's own read of
   * closureReasonLookupValueId (REASONS_REQUIRING_REVIEW), never from client
   * input — a client can no longer set supervisorStatus/supervisorId
   * directly to self-approve a closure and skip review (see
   * createClosureSchema's doc comment).
   *
   * A concurrent retry racing on the same localClosureUuid (two near-
   * simultaneous requests both passing the findByLocalClosureUuid check as
   * null) hits the column's own unique constraint on create() — caught here
   * and turned into the same idempotent-replay result as a sequential retry,
   * rather than a raw 500.
   */
  async create(dto: CreateClosureInput, authorizationHeader: string) {
    const existing = await this.repository.findByLocalClosureUuid(dto.localClosureUuid);
    if (existing) return existing;

    // Delegates ownership scoping to beneficiary-service's own
    // GET /beneficiaries/:id (SAKHI-own-case / SUPERVISOR-roster /
    // MANAGER-unrestricted) rather than duplicating that IDOR check here —
    // this service owns no sakhiId data of its own. Without this, any
    // authenticated SAKHI could raise a closure (and, for a MIGRATION
    // reason, a real supervisor-approval card) for a beneficiary they have
    // no relationship to. Throws 403/404 as-is on failure.
    await this.beneficiaryClient.getById(dto.beneficiaryId, authorizationHeader);

    const reasonCode = await this.lookupClient.resolveClosureReasonCode(
      dto.closureReasonLookupValueId,
      authorizationHeader,
    );
    const supervisorStatus =
      reasonCode && REASONS_REQUIRING_REVIEW.has(reasonCode) ? ('PENDING' as const) : null;

    let created;
    try {
      created = await this.repository.create(dto, supervisorStatus);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        const winner = await this.repository.findByLocalClosureUuid(dto.localClosureUuid);
        if (winner) return winner;
      }
      throw err;
    }

    if (created.supervisorStatus === 'PENDING') {
      try {
        const decisionStatusLookupId = await this.lookupClient.resolveApprovalStatusId(
          'PENDING',
          authorizationHeader,
        );
        if (decisionStatusLookupId) {
          await this.approvalClient.create(
            {
              requestType: 'CLOSURE_REVIEW',
              beneficiaryId: created.beneficiaryId,
              sourceEntityType: 'Closure',
              sourceEntityId: created.id,
              closureId: created.id,
              requestedByUserId: created.submittedByUserId,
              decisionStatusLookupId,
            },
            authorizationHeader,
          );
        } else {
          console.error(
            `Closure ${created.id} was created but no PENDING APPROVAL_STATUS lookup value was found — Quick Response card not raised.`,
          );
        }
      } catch (err) {
        console.error(
          `Closure ${created.id} was created but raising its Quick Response card failed:`,
          err,
        );
      }
    } else {
      // No supervisor review needed (MEDICAL/NON_MEDICAL/PROGRAM_COMPLETION)
      // — close the beneficiary right away instead of waiting on a decision
      // that will never come. Best-effort/tolerated, same stance as the
      // Quick Response card raise above: the closures row is already the
      // source of truth for this submission having happened.
      try {
        await this.beneficiaryClient.closeCase(
          created.beneficiaryId,
          created.closureType,
          authorizationHeader,
        );
      } catch (err) {
        console.error(
          `Closure ${created.id} was created but closing beneficiary ${created.beneficiaryId} failed:`,
          err,
        );
      }
    }

    return created;
  }

  /**
   * Decides a pending closure review (FR-SV-4.4). Approve/Reject both flip
   * supervisorStatus here. On APPROVED, also closes the beneficiary case via
   * beneficiary-service (the "beneficiary moves to the Closed list"
   * consequence — out of this service's own ownership per the forklift
   * rule). REJECTED leaves the beneficiary exactly as it was — same
   * "rejection changes nothing beyond the closures row" contract
   * reopen-request.service.ts's decide() uses for a rejected reopen.
   *
   * The beneficiary-close call is best-effort (logged, not thrown) — the
   * decision above is already committed, and this method's own guard
   * (supervisorStatus !== 'PENDING') means a closure can never be decided a
   * second time to retry just this step; same tolerance/manual-follow-up
   * stance as reopen-request.service.ts's decide() uses for reactivateCase.
   *
   * Also re-checks ownership scoping against beneficiary-service before
   * touching supervisorStatus — same roster check create() relies on,
   * closing the gap where a SUPERVISOR who merely learns a closure id
   * outside their own roster could otherwise decide it.
   */
  async decide(
    id: string,
    decidedBySupervisorId: string,
    dto: DecideClosureInput,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Closure not found.');

    // Delegates ownership scoping to beneficiary-service's own GET
    // /beneficiaries/:id (SAKHI-own-case / SUPERVISOR-roster /
    // MANAGER-unrestricted) — same pattern create() already uses. Without
    // this, any SUPERVISOR who learns a closure id outside their own
    // roster could approve or reject it (IDOR). Its response is also reused
    // below for the Sakhi notification's beneficiary name, avoiding a
    // second fetch.
    const beneficiary = await this.beneficiaryClient.getById(
      existing.beneficiaryId,
      authorizationHeader,
    );

    if (existing.supervisorStatus === null) {
      throw unprocessable('This closure does not require supervisor review.');
    }
    if (existing.supervisorStatus !== 'PENDING') {
      throw conflict('This closure has already been decided.');
    }

    const updated = await this.repository.decide(id, decidedBySupervisorId, dto);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict('This closure has already been decided.');
    }

    const decided = await this.repository.findById(id);

    if (dto.decision === 'APPROVED') {
      try {
        await this.beneficiaryClient.closeCase(
          existing.beneficiaryId,
          existing.closureType,
          authorizationHeader,
        );
      } catch (err) {
        console.error(
          `Closure ${id} was approved but closing beneficiary ${existing.beneficiaryId} ` +
            `failed (this closure cannot be re-decided to retry — needs manual follow-up):`,
          err,
        );
      }
    }

    try {
      const sakhiName = await this.resolveSakhiName(
        existing.submittedByUserId,
        authorizationHeader,
      );
      const beneficiaryName = beneficiary?.pii.fullName ?? null;
      await this.notificationClient.notify(
        existing.submittedByUserId,
        'CLOSURE_REVIEW_UPDATE',
        sakhiName ? `Closure review — ${sakhiName}` : 'Closure review decided',
        beneficiaryName
          ? dto.decision === 'APPROVED'
            ? `${beneficiaryName}'s closure request was approved`
            : `${beneficiaryName}'s closure request was rejected`
          : dto.decision === 'APPROVED'
            ? 'Your closure request was approved.'
            : 'Your closure request was rejected.',
        authorizationHeader,
        { linkedEntityType: 'Closure', linkedEntityId: id },
      );
    } catch (err) {
      console.error(
        `Closure ${id} was decided (${dto.decision}) but the Sakhi notification failed:`,
        err,
      );
    }

    return decided;
  }
}
