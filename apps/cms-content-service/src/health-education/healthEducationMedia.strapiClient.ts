import { badGateway, HttpError } from '@armman/service-commons';

// Read directly from process.env (not appConfig) so importing this module
// doesn't force STRAPI_* validation on every consumer/test — matches
// learnMore.strapiClient.ts's own convention. Validated eagerly in the
// constructor below, not just read here.
const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL ?? 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN ?? '';

export interface StrapiMediaFile {
  url: string;
}

/**
 * One health-education media entry in Strapi. `slug` is matched verbatim
 * against HealthEducationMessage.mediaFile by healthEducationMedia.syncService.ts
 * — an ARMMAN-authored content decision (mediaFile values ARE the intended
 * Strapi slugs), not a convention this client invents. Unlike Learn More's
 * two-level Section/Topic tree, this is a flat list: HealthEducationMessage
 * has no equivalent grouping, so there is nothing to nest under.
 */
export interface StrapiHealthEducationMedia {
  documentId: string;
  slug: string | null;
  mediaFile: StrapiMediaFile | null;
}

interface StrapiHealthEducationMediaResponse {
  data: StrapiHealthEducationMedia[];
}

/**
 * Read-only client for health-education media authored in Strapi (SRS
 * §2.1's CMS/Media row: "Health education content, Learn More, binary
 * assets"). Used only by the manual sync endpoint
 * (POST /health-education/media-sync) — the app itself never calls Strapi
 * directly, same pattern as LearnMoreStrapiClient.
 *
 * NOTE: the exact Strapi content-type name/shape below
 * ("health-education-media", a flat collection with a `slug` and a single
 * `mediaFile`) is this implementation's own assumption, not confirmed
 * against a real Strapi instance — no reachable instance exists to verify
 * against as of this writing. Adjust the endpoint path/populate query once
 * ARMMAN's actual content-type is confirmed.
 */
export class HealthEducationMediaStrapiClient {
  /** Fails fast at construction so a misconfigured service never starts. */
  constructor(
    private readonly baseUrl: string = STRAPI_BASE_URL,
    private readonly apiToken: string = STRAPI_API_TOKEN,
  ) {
    try {
      new URL(this.baseUrl);
    } catch {
      throw new Error('HealthEducationMediaStrapiClient: STRAPI_BASE_URL is not a valid URL.');
    }
    if (!this.apiToken) {
      throw new Error('HealthEducationMediaStrapiClient: STRAPI_API_TOKEN is not set.');
    }
  }

  /** Fetches every health-education media entry with its mediaFile populated. */
  async fetchMediaEntries(): Promise<StrapiHealthEducationMedia[]> {
    const url = new URL('/api/health-education-media', this.baseUrl);
    url.searchParams.set('populate', 'mediaFile');

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
    } catch {
      throw badGateway('Unable to reach Strapi — connection failed.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new HttpError(res.status, 'Strapi rejected the request (check STRAPI_API_TOKEN).');
      }
      throw badGateway('Strapi returned an error while fetching health-education media.');
    }

    const body = (await res.json()) as StrapiHealthEducationMediaResponse;
    return body.data;
  }

  /** Resolves a Strapi-relative media URL (e.g. `/uploads/foo.mp4`) to an absolute one. */
  resolveMediaUrl(relativeUrl: string): string {
    return new URL(relativeUrl, this.baseUrl).toString();
  }
}
