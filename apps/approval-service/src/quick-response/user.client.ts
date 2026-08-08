import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface UserProfileRecord {
  id: string;
  status: string;
}

/**
 * Reactivates a Sakhi's user account by calling auth-service's
 * PATCH /users/:id/reactivate through the gateway, forwarding the caller's
 * own Authorization header — same pattern this service's other clients use.
 * Used for the DATA_RESTORE card's approved-decision path — narrow scope,
 * not a general user-management call (see auth-service's own
 * AuthService.reactivateUser doc comment).
 */
export class UserClient {
  async reactivateUser(userId: string, authorizationHeader: string): Promise<UserProfileRecord> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/users/${userId}/reactivate`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to reactivate the user — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to reactivate the user.');
      }
      throw badGateway('Unable to reactivate the user — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: UserProfileRecord };
    return body.data;
  }
}
