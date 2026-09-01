import { NotificationClient } from './notification.client';

const AUTH_HEADER = 'Bearer test-token';

describe('NotificationClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: NotificationClient;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new NotificationClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('fetches with an AbortSignal timeout', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await client.notify('sakhi-1', 'SUPERVISOR_APPROVAL_REQUESTED', 'title', 'body', AUTH_HEADER);

    const options = fetchMock.mock.calls[0][1] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws a 502 when notification-escalation-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    await expect(
      client.notify('sakhi-1', 'SUPERVISOR_APPROVAL_REQUESTED', 'title', 'body', AUTH_HEADER),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws a 502 when notification-escalation-service returns an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      client.notify('sakhi-1', 'SUPERVISOR_APPROVAL_REQUESTED', 'title', 'body', AUTH_HEADER),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('resolves when notification-escalation-service accepts the notification', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await expect(
      client.notify('sakhi-1', 'SUPERVISOR_APPROVAL_REQUESTED', 'title', 'body', AUTH_HEADER),
    ).resolves.toBeUndefined();
  });
});
