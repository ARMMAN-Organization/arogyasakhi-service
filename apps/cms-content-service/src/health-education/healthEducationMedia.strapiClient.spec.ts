import { HealthEducationMediaStrapiClient } from './healthEducationMedia.strapiClient';

describe('HealthEducationMediaStrapiClient', () => {
  const baseUrl = 'http://localhost:1337';
  const apiToken = 'test-token';
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('throws at construction when baseUrl is not a valid URL', () => {
    expect(() => new HealthEducationMediaStrapiClient('not-a-url', apiToken)).toThrow(
      'STRAPI_BASE_URL is not a valid URL',
    );
  });

  it('throws at construction when apiToken is empty', () => {
    expect(() => new HealthEducationMediaStrapiClient(baseUrl, '')).toThrow(
      'STRAPI_API_TOKEN is not set',
    );
  });

  it('fetches and returns media entries', async () => {
    const entries = [
      { documentId: 'm1', slug: 'anaemia', mediaFile: { url: '/uploads/anaemia.jpg' } },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: entries }) });

    const client = new HealthEducationMediaStrapiClient(baseUrl, apiToken);
    const result = await client.fetchMediaEntries();

    expect(result).toEqual(entries);
  });

  it('requests mediaFile via a populate query against the health-education-media collection', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    const client = new HealthEducationMediaStrapiClient(baseUrl, apiToken);

    await client.fetchMediaEntries();

    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get('populate')).toBe('mediaFile');
    expect(calledUrl.pathname).toBe('/api/health-education-media');
  });

  it('throws a 4xx HttpError when Strapi rejects the token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const client = new HealthEducationMediaStrapiClient(baseUrl, apiToken);

    await expect(client.fetchMediaEntries()).rejects.toMatchObject({ status: 401 });
  });

  it('throws a 502 when Strapi returns a server error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const client = new HealthEducationMediaStrapiClient(baseUrl, apiToken);

    await expect(client.fetchMediaEntries()).rejects.toMatchObject({ status: 502 });
  });

  it('throws a 502 when the fetch call itself fails (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new HealthEducationMediaStrapiClient(baseUrl, apiToken);

    await expect(client.fetchMediaEntries()).rejects.toMatchObject({ status: 502 });
  });

  it('resolves a relative media URL against the Strapi base URL', () => {
    const client = new HealthEducationMediaStrapiClient(baseUrl, apiToken);

    expect(client.resolveMediaUrl('/uploads/anaemia.jpg')).toBe(
      'http://localhost:1337/uploads/anaemia.jpg',
    );
  });
});
