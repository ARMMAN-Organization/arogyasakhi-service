import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ROLES_KEY } from './roles.decorator';

interface AuthenticatedUser {
  id: string;
  roles: string[];
}

/**
 * Enforces role-based access at the server edge. Assumes an upstream auth guard
 * has populated `request.user`. Authorization is NEVER left to the client.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required.');

    const allowed = user.roles.some((role) => required.includes(role));
    if (!allowed) throw new ForbiddenException('You do not have access to this resource.');
    return true;
  }
}
