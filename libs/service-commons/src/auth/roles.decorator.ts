import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Declares which roles may access a route. Enforced by RbacGuard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
