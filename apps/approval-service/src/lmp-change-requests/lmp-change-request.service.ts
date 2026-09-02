import { HttpError } from '@armman/service-commons';
import type { LmpChangeRequestRepository } from './lmp-change-request.repository';
import type { LookupClient } from '../quick-response/lookup.client';
import type { QuickResponseService } from '../quick-response/quick-response.service';
import type { CreateLmpChangeRequestInput } from './dto/create-lmpChangeRequest.dto';

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
 * LMP_CHANGE approval request creation + beneficiary-scoped listing.
 * LMP_CHANGE has no table of its own — every row here is a plain
 * `approval_requests` row with `requestType: 'LMP_CHANGE'` (see
 * quick-response.service.ts's getLmpChangeRequestDetail, whose card-decision
 * side already reads/decides these rows). This service only adds the
 * missing creation side and a read-only list; decision stays owned by
 * QuickResponseService, unchanged.
 */
export class LmpChangeRequestService {
  constructor(
    private readonly repository: LmpChangeRequestRepository,
    private readonly lookupClient: LookupClient,
    private readonly quickResponseService: QuickResponseService,
  ) {}

  /**
   * Raises a Sakhi's LMP change request (FR-SV-4.2's raise side).
   *
   * Idempotent replay: a dropped-connection retry resubmits the same
   * client-generated localRequestUuid. Returns the original request
   * unchanged instead of creating a duplicate row — this mobile flow is
   * offline-first and expected to retry, same convention as reopen
   * requests' localReopenRequestUuid.
   *
   * A concurrent retry racing on the same localRequestUuid (two near-
   * simultaneous requests both passing the findByLocalRequestUuid check as
   * null) hits the column's own unique constraint on create() — caught here
   * and turned into the same idempotent-replay result as a sequential retry,
   * rather than a raw 500. Same pattern as reopen-request.service.ts's
   * create().
   *
   * Returns the response in the same shape callers get from the existing
   * `GET /lmp-change-requests/:id` route, `wasCreated` telling the route
   * whether to answer 201 (new) or 200 (idempotent replay).
   */
  async create(
    dto: CreateLmpChangeRequestInput,
    requestedByUserId: string,
    authorizationHeader: string,
  ): Promise<{
    detail: Awaited<ReturnType<QuickResponseService['getLmpChangeRequestDetail']>>;
    wasCreated: boolean;
  }> {
    const existing = await this.repository.findByLocalRequestUuid(dto.localRequestUuid);
    if (existing) {
      return {
        detail: await this.quickResponseService.getLmpChangeRequestDetail(
          existing.id,
          authorizationHeader,
        ),
        wasCreated: false,
      };
    }

    const decisionStatusLookupId = await this.lookupClient.resolveApprovalStatusId(
      'PENDING',
      authorizationHeader,
    );
    if (!decisionStatusLookupId) {
      // Unlike REOPEN's best-effort card-raise (its ReopenRequest row is
      // already committed and is its own source of truth), there is no
      // separate resource here — the approval_requests row IS the LMP change
      // request, and decisionStatusLookupId is a required column, so a
      // missing PENDING lookup value means the row genuinely cannot be
      // created, not a tolerable side-effect failure.
      throw new HttpError(
        500,
        'No PENDING APPROVAL_STATUS lookup value was found for this environment.',
      );
    }

    let created;
    try {
      created = await this.repository.create({
        beneficiaryId: dto.beneficiaryId,
        requestedByUserId,
        decisionStatusLookupId,
        requestPayloadJson: dto,
        localRequestUuid: dto.localRequestUuid,
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        const winner = await this.repository.findByLocalRequestUuid(dto.localRequestUuid);
        if (winner) {
          return {
            detail: await this.quickResponseService.getLmpChangeRequestDetail(
              winner.id,
              authorizationHeader,
            ),
            wasCreated: false,
          };
        }
      }
      throw err;
    }

    return {
      detail: await this.quickResponseService.getLmpChangeRequestDetail(
        created.id,
        authorizationHeader,
      ),
      wasCreated: true,
    };
  }

  /**
   * All LMP change requests for one beneficiary, most-recent-first — lets
   * the Sakhi app poll for status after submitting one (FR-SV-4.2). Reuses
   * `QuickResponseService.getLmpChangeRequestDetail`'s existing mapping for
   * each row rather than duplicating its beneficiary/pada/sakhi enrichment
   * and requestPayloadJson unwrapping.
   */
  async listByBeneficiaryId(beneficiaryId: string, authorizationHeader: string) {
    const rows = await this.repository.findByBeneficiaryId(beneficiaryId);
    return Promise.all(
      rows.map((row) =>
        this.quickResponseService.getLmpChangeRequestDetail(row.id, authorizationHeader),
      ),
    );
  }
}
