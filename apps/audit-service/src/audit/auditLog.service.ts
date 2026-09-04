import { conflict, forbidden } from '@armman/service-commons';
import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

/** Shape returned by {@link AuditLogRepository.findByLocalAuditUuid}. */
type ExistingAuditLog = Awaited<ReturnType<AuditLogRepository['findByLocalAuditUuid']>>;

export interface CallerIdentity {
  id: string;
  roles: string[];
}

/**
 * Narrows a caught Prisma error to a unique-constraint violation (P2002) on
 * `columnName` specifically — not just any P2002 (security review finding,
 * 2026-09-02). Safe today only because audit_log has exactly one non-PK
 * unique column (local_audit_uuid); the moment a second one is added, an
 * unscoped check would silently misreport that unrelated collision as an
 * idempotent replay of this one. Same fix as
 * lmp-change-request.service.ts's identical copy (added the same day; not
 * cross-service-imported per the forklift rule).
 */
function isUniqueConstraintViolation(err: unknown, columnName: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  if ((err as { code: unknown }).code !== 'P2002') return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) return false;
  const target = (meta as { target?: unknown }).target;
  return Array.isArray(target) ? target.includes(columnName) : target === columnName;
}

// Action-name prefixes a non-ADMIN role may log, keyed by role. A caller in
// one of these roles may only write actions starting with one of its listed
// prefixes, and actorUserId is always forced to the caller's own id.
const ALLOWED_ACTION_PREFIXES: Record<string, readonly string[]> = {
  // approval-service forwards both a Quick Response decision's and an
  // LMP-change decision's audit entry using the deciding Supervisor's own
  // Authorization header. POST /quick-response/:cardId/decision (the only
  // endpoint that decides an LMP_CHANGE card) is gated requireRoles('SUPERVISOR')
  // exclusively — there is no SAKHI-authenticated path to it, and the Sakhi
  // who originally requested the LMP change isn't in the request chain when a
  // Supervisor later decides the card — so LMP_CHANGE_* audit entries are
  // always, and can only be, attributed to the deciding Supervisor.
  // decideDataRestoreCard forwards the deciding Supervisor's own
  // Authorization header the same way as LMP_CHANGE_ above — the DATA_RESTORE
  // card's decide endpoint is the same requireRoles('SUPERVISOR')-gated
  // POST /quick-response/:cardId/decision, so DATA_RESTORE_* entries are
  // always attributed to the deciding Supervisor, never the Sakhi.
  SUPERVISOR: ['QUICK_RESPONSE_', 'LMP_CHANGE_', 'DATA_RESTORE_'],
  // visit-form-service will forward a Sakhi's own form answer edit audit
  // entry the same way. The prefix is written without a trailing underscore
  // (deliberately just 'FORM_ANSWER_EDIT') because the sibling task that adds
  // the actual caller logs the literal action 'FORM_ANSWER_EDIT' with no
  // suffix (see the plan's Task 5) — a trailing-underscore prefix would not
  // match that literal and would 403 the caller this allowance exists for.
  SAKHI: ['FORM_ANSWER_EDIT'],
};

// entityType a non-ADMIN caller must supply for a given action prefix —
// closes the gap the prefix check alone leaves open (security review
// finding, 2026-09-02): without this, a SAKHI whose action passes the
// FORM_ANSWER_EDIT prefix check could still supply any entityType/entityId
// she likes, fabricating an audit entry that appears to document an edit to
// an entity she has no relationship to. Checked only when the action has an
// entry here — QUICK_RESPONSE_ has no real caller/entityType yet (nothing in
// this codebase writes that action today), so it is deliberately left
// unconstrained until a real call site defines what entityType it should use.
const REQUIRED_ENTITY_TYPE_BY_ACTION_PREFIX: Record<string, string> = {
  FORM_ANSWER_EDIT: 'FormSubmission',
  LMP_CHANGE_: 'MotherCaseDetails',
  DATA_RESTORE_: 'User',
};

/**
 * Verifies a row found by localAuditUuid genuinely is a retry of `toCreate`,
 * not an unrelated row that happens to share the client-supplied UUID.
 *
 * localAuditUuid is client-generated and globally unique across ALL callers
 * — without this check, a caller could supply a UUID that collides with a
 * different actor/action/entity's row (predicted, observed, or maliciously
 * guessed) and have that unrelated row's full contents — including another
 * actor's PII-adjacent audit data — returned as if it were their own,
 * before this create's own authorization is ever reached (cross-actor IDOR).
 * `beforeJson`/`afterJson` are deliberately excluded: they may legitimately
 * be recomputed slightly differently between retries of the same logical
 * write.
 */
function isSameLogicalEntry(existing: ExistingAuditLog, toCreate: CreateAuditLogInput): boolean {
  return (
    existing !== null &&
    (existing.actorUserId ?? undefined) === toCreate.actorUserId &&
    existing.action === toCreate.action &&
    existing.entityType === toCreate.entityType &&
    (existing.entityId ?? undefined) === toCreate.entityId
  );
}

/** Audit log domain logic. Data access is delegated to the repository. */
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * ADMIN may log any entry as-is. Any other role (SUPERVISOR, SAKHI — both
   * widened onto this route so approval-service/visit-form-service can
   * forward a caller's own decision as an audit entry) may only log an
   * action within their role's allowlisted namespace — actorUserId is forced
   * to the caller's own id (never the client-supplied value) — so the
   * widened role can never forge an entry attributed to someone else or
   * write an arbitrary action/entityType.
   *
   * LMP_CHANGE_* and DATA_RESTORE_* are allowlisted under SUPERVISOR, not
   * SAKHI: the deciding Supervisor is the only caller in the request chain
   * when an LMP-change or DATA_RESTORE card is decided, so those entries
   * are always attributed to them (see ALLOWED_ACTION_PREFIXES above).
   *
   * SAKHI additionally 403s outright if the client-supplied actorUserId
   * names someone other than the caller, rather than silently overriding it
   * (SUPERVISOR's existing QUICK_RESPONSE_* behavior is unchanged here —
   * it keeps silently forcing actorUserId, per the original design).
   *
   * Idempotent replay: a dropped-connection retry resubmits the same
   * client-generated localAuditUuid. Returns the original entry unchanged
   * instead of inserting a duplicate row — same convention as
   * approval_requests.localRequestUuid / reopen_requests.localReopenRequestUuid.
   *
   * A concurrent retry racing on the same localAuditUuid (two near-
   * simultaneous requests both passing the findByLocalAuditUuid check as
   * null) hits the column's own unique constraint on create() — caught here
   * and turned into the same idempotent-replay result as a sequential retry,
   * rather than a raw 500.
   *
   * The row found by localAuditUuid is only ever returned as-is when
   * isSameLogicalEntry confirms it matches this caller's actorUserId/
   * action/entityType/entityId — localAuditUuid is a client-generated value
   * with no scoping to the caller, so returning any row matched purely by
   * that UUID would let one caller read another actor's audit entry (e.g. a
   * different Sakhi's or a Supervisor's) just by supplying (or colliding
   * with) its UUID, before this create's own authorization is reached
   * (cross-actor IDOR — security review finding, 2026-09-02). A UUID that
   * matches a row belonging to a different logical write is a genuine
   * collision, not a safe retry, so it 409s instead — same shape as
   * risk-referral-service's visitId idempotent-create handling.
   */
  async create(dto: CreateAuditLogInput, caller: CallerIdentity) {
    let toCreate = dto;
    if (!caller.roles.includes('ADMIN')) {
      const allowedPrefixes = caller.roles.flatMap((role) => ALLOWED_ACTION_PREFIXES[role] ?? []);
      const matchedPrefix = allowedPrefixes.find((prefix) => dto.action.startsWith(prefix));
      if (!matchedPrefix) {
        throw forbidden('Caller role may not log this action.');
      }
      const requiredEntityType = REQUIRED_ENTITY_TYPE_BY_ACTION_PREFIX[matchedPrefix];
      if (requiredEntityType && dto.entityType !== requiredEntityType) {
        throw forbidden(`Action "${matchedPrefix}" must use entityType "${requiredEntityType}".`);
      }
      if (
        caller.roles.includes('SAKHI') &&
        dto.actorUserId !== undefined &&
        dto.actorUserId !== caller.id
      ) {
        throw forbidden('SAKHI may only log actions attributed to themselves.');
      }
      toCreate = { ...dto, actorUserId: caller.id };
    }

    if (toCreate.localAuditUuid) {
      const existing = await this.repository.findByLocalAuditUuid(toCreate.localAuditUuid);
      if (existing) {
        if (!isSameLogicalEntry(existing, toCreate)) {
          throw conflict(
            'This localAuditUuid is already used by a different audit entry — this looks like a ' +
              'UUID collision, not a retry of the same request.',
          );
        }
        return existing;
      }
    }

    try {
      return await this.repository.create(toCreate);
    } catch (err) {
      if (toCreate.localAuditUuid && isUniqueConstraintViolation(err, 'local_audit_uuid')) {
        const winner = await this.repository.findByLocalAuditUuid(toCreate.localAuditUuid);
        if (winner) {
          if (!isSameLogicalEntry(winner, toCreate)) {
            throw conflict(
              'This localAuditUuid is already used by a different audit entry — this looks like a ' +
                'UUID collision, not a retry of the same request.',
            );
          }
          return winner;
        }
      }
      throw err;
    }
  }
}
