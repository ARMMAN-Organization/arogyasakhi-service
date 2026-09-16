import { LearnMoreStrapiClient } from './learnMore.strapiClient';

describe('LearnMoreStrapiClient', () => {
  const baseUrl = 'http://localhost:1337';
  const apiToken = 'test-token';
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('throws at construction when baseUrl is not a valid URL', () => {
    expect(() => new LearnMoreStrapiClient('not-a-url', apiToken)).toThrow(
      'STRAPI_BASE_URL is not a valid URL',
    );
  });

  it('throws at construction when apiToken is empty', () => {
    expect(() => new LearnMoreStrapiClient(baseUrl, '')).toThrow('STRAPI_API_TOKEN is not set');
  });

  it('fetches and returns sections', async () => {
    const sections = [
      { documentId: 's1', slug: 'anemia', name: 'Anemia', sortOrder: 0, topics: [] },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: sections }) });

    const client = new LearnMoreStrapiClient(baseUrl, apiToken);
    const result = await client.fetchSections();

    expect(result).toEqual(sections);
  });

  it('requests topics.mediaFile via a nested populate query', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    const client = new LearnMoreStrapiClient(baseUrl, apiToken);

    await client.fetchSections();

    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get('populate[topics][populate]')).toBe('mediaFile');
    expect(calledUrl.pathname).toBe('/api/sections');
  });

  it('throws a 4xx HttpError when Strapi rejects the token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const client = new LearnMoreStrapiClient(baseUrl, apiToken);

    await expect(client.fetchSections()).rejects.toMatchObject({ status: 401 });
  });

  it('throws a 502 when Strapi returns a server error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const client = new LearnMoreStrapiClient(baseUrl, apiToken);

    await expect(client.fetchSections()).rejects.toMatchObject({ status: 502 });
  });

  it('throws a 502 when the fetch call itself fails (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new LearnMoreStrapiClient(baseUrl, apiToken);

    await expect(client.fetchSections()).rejects.toMatchObject({ status: 502 });
  });

  it('resolves a relative media URL against the Strapi base URL', () => {
    const client = new LearnMoreStrapiClient(baseUrl, apiToken);

    expect(client.resolveMediaUrl('/uploads/foo.mp4')).toBe(
      'http://localhost:1337/uploads/foo.mp4',
    );
  });
});
