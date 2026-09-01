import { badGateway, HttpError } from '../http/http-error';

// Read directly (not via each service's appConfig) so importing this client
// doesn't force a specific config schema on every consumer — matches the
// per-service *.client.ts convention of reading API_GATEWAY_BASE_URL directly.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface ServiceTokenResponse {
  data: { accessToken: string; expiresIn: number; roles: string[] };
}

/**
 * Mints and caches a machine-identity access token via the client-credentials
 * exchange (`POST /auth/service-token`) — the real "server-to-server" auth
 * this platform was missing (automated jobs previously had no way to call an
 * ADMIN-only endpoint without forwarding a human's own token).
 *
 * One instance per consuming process is enough — cron jobs are long-running
 * processes, not one-shot invocations, so caching in memory across job runs
 * avoids re-authenticating on every tick. Not safe to share across unrelated
 * clientId/clientSecret pairs; construct one per service account.
 */
export class ServiceTokenClient {
  private cached: { accessToken: string; expiresAtMs: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  /** Returns a cached token if it has more than 30s left, otherwise mints a new one. */
  async getToken(): Promise<string> {
    const REFRESH_MARGIN_MS = 30_000;
    if (this.cached && this.cached.expiresAtMs - Date.now() > REFRESH_MARGIN_MS) {
      return this.cached.accessToken;
    }

    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/auth/service-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }),
      });
    } catch {
      throw badGateway('Unable to mint a service token — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to mint a service token.');
      }
      throw badGateway('Unable to mint a service token — auth-service returned an error.');
    }

    const body = (await res.json()) as ServiceTokenResponse;
    this.cached = {
      accessToken: body.data.accessToken,
      expiresAtMs: Date.now() + body.data.expiresIn * 1000,
    };
    return this.cached.accessToken;
  }
}
