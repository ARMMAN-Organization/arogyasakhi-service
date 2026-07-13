/**
 * Roles are enforced with the `requireRoles(...)` Express middleware
 * (see `rbac.guard.ts`) applied directly on routes. The former NestJS `@Roles`
 * metadata decorator no longer exists. This constant is kept for reference by
 * any code that groups route role requirements.
 */
export const ROLES_KEY = 'roles';
