import { resolveEducationContent } from './educationContent.client';

const AUTH_HEADER = 'Bearer test-token';

describe('resolveEducationContent', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the topic when cms-content-service resolves it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          topicCode: 'COMING_SOON',
          topicName: 'Content coming soon',
          mediaType: 'QNA_TEXT',
          contentUrl: null,
        },
      }),
    });

    const result = await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    expect(result).toEqual({
      topicCode: 'COMING_SOON',
      topicName: 'Content coming soon',
      mediaType: 'QNA_TEXT',
      contentUrl: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/learn-more/topics/COMING_SOON'),
      expect.objectContaining({ headers: { Authorization: AUTH_HEADER } }),
    );
  });

  it('strips undeclared fields (id, sortOrder) from the upstream response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'some-uuid',
          topicCode: 'COMING_SOON',
          topicName: 'Content coming soon',
          mediaType: 'QNA_TEXT',
          contentUrl: null,
          sortOrder: 3,
        },
      }),
    });

    const result = await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    expect(result).toEqual({
      topicCode: 'COMING_SOON',
      topicName: 'Content coming soon',
      mediaType: 'QNA_TEXT',
      contentUrl: null,
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('sortOrder');
  });

  it('passes an AbortSignal so a slow (not down) dependency times out instead of hanging', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          topicCode: 'COMING_SOON',
          topicName: 'Content coming soon',
          mediaType: 'QNA_TEXT',
          contentUrl: null,
        },
      }),
    });

    await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns null when the request times out, without throwing', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));

    const result = await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    expect(result).toBeNull();
  });

  it('returns null when the topic does not exist (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await resolveEducationContent('MISSING_CODE', AUTH_HEADER);

    expect(result).toBeNull();
  });

  it('returns null on a 5xx from cms-content-service, without throwing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    expect(result).toBeNull();
  });

  it('returns null when cms-content-service is unreachable, without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    expect(result).toBeNull();
  });

  it('returns null on a malformed response body, without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid JSON');
      },
    });

    const result = await resolveEducationContent('COMING_SOON', AUTH_HEADER);

    expect(result).toBeNull();
  });
});
