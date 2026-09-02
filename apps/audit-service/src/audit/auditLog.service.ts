import { forbidden } from '@armman/service-commons';
import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

export interface CallerIdentity {
  id: string;
  roles: string[];
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

// Action-name prefixes a non-ADMIN role may log, keyed by role. A caller in
// one of these roles may only write actions starting with one of its listed
// prefixes, and actorUserId is always forced to the caller's own id — so a
// widened role can never forge an entry attributed to someone else or write
// an arbitrary action/entityType.
const ALLOWED_ACTION_PREFIXES: Record<string, readonly string[]> = {
  // approval-service forwards a Quick Response decision's audit entry using
  // the deciding Supervisor's own Authorization header.
  SUPERVISOR: ['QUICK_RESPONSE_'],
  // approval-service/visit-form-service will forward a Sakhi's own LMP
  // change decision / form answer edit audit entry the same way. The
  // FORM_ANSWER_EDIT_ prefix is written without a trailing underscore
  // (deliberately just 'FORM_ANSWER_EDIT') because the sibling task that adds
  // the actual caller logs the literal action 'FORM_ANSWER_EDIT' with no
  // suffix (see the plan's Task 5) — a trailing-underscore prefix would not
  // match that literal and would 403 the caller this allowance exists for.
  SAKHI: ['LMP_CHANGE_', 'FORM_ANSWER_EDIT'],
};

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
   */
  async create(dto: CreateAuditLogInput, caller: CallerIdentity) {
    let toCreate = dto;
    if (!caller.roles.includes('ADMIN')) {
      const allowedPrefixes = caller.roles.flatMap((role) => ALLOWED_ACTION_PREFIXES[role] ?? []);
      if (!allowedPrefixes.some((prefix) => dto.action.startsWith(prefix))) {
        throw forbidden('Caller role may not log this action.');
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
      if (existing) return existing;
    }

    try {
      return await this.repository.create(toCreate);
    } catch (err) {
      if (toCreate.localAuditUuid && isUniqueConstraintViolation(err)) {
        const winner = await this.repository.findByLocalAuditUuid(toCreate.localAuditUuid);
        if (winner) return winner;
      }
      throw err;
    }
  }
}
