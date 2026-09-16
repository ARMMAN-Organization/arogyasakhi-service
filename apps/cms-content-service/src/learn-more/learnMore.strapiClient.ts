import { badGateway, HttpError } from '@armman/service-commons';

// Read directly from process.env (not appConfig) so importing this module
// doesn't force STRAPI_* validation on every consumer/test — matches the
// convention in libs/service-commons/src/auth/service-token-client.ts.
// Validated eagerly in the constructor below, not just read here.
const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL ?? 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN ?? '';

export interface StrapiMediaFile {
  url: string;
}

export interface StrapiTopic {
  documentId: string;
  slug: string | null;
  title: string;
  mediaType: string;
  qnaText: string | null;
  mediaFile: StrapiMediaFile | null;
  sortOrder: number;
}

export interface StrapiSection {
  documentId: string;
  slug: string | null;
  name: string;
  sortOrder: number;
  topics: StrapiTopic[];
}

interface StrapiSectionsResponse {
  data: StrapiSection[];
}

/**
 * Read-only client for the Learn More content authored in Strapi
 * (SRS FR-S-13.1-13.4). Used only by the manual sync endpoint — the app
 * itself never calls Strapi directly (see learnMore.syncService.ts).
 */
export class LearnMoreStrapiClient {
  /** Fails fast at construction so a misconfigured service never starts. */
  constructor(
    private readonly baseUrl: string = STRAPI_BASE_URL,
    private readonly apiToken: string = STRAPI_API_TOKEN,
  ) {
    try {
      new URL(this.baseUrl);
    } catch {
      throw new Error('LearnMoreStrapiClient: STRAPI_BASE_URL is not a valid URL.');
    }
    if (!this.apiToken) {
      throw new Error('LearnMoreStrapiClient: STRAPI_API_TOKEN is not set.');
    }
  }

  /**
   * Fetches every Section with its Topics and each Topic's media file.
   * `populate=*` is shallow (one level) in Strapi 5 — `mediaFile` sits two
   * levels down (Section -> topics -> mediaFile), so it needs an explicit
   * nested populate query.
   */
  async fetchSections(): Promise<StrapiSection[]> {
    const url = new URL('/api/sections', this.baseUrl);
    url.searchParams.set('populate[topics][populate]', 'mediaFile');

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
      throw badGateway('Strapi returned an error while fetching Learn More content.');
    }

    const body = (await res.json()) as StrapiSectionsResponse;
    return body.data;
  }

  /** Resolves a Strapi-relative media URL (e.g. `/uploads/foo.mp4`) to an absolute one. */
  resolveMediaUrl(relativeUrl: string): string {
    return new URL(relativeUrl, this.baseUrl).toString();
  }
}
