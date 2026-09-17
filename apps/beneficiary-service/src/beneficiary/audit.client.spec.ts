import { AuditClient } from './audit.client';

describe('AuditClient.log', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the audit entry through the gateway with the caller Authorization header', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201 });
    const client = new AuditClient();

    await client.log(
      'sakhi-1',
      'BENEFICIARY_STATUS_CLOSED',
      'BeneficiaryCase',
      'ben-1',
      { currentStatus: 'ACTIVE' },
      { currentStatus: 'CLOSED' },
      'Bearer test-token',
      'local-uuid-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audit'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      actorUserId: 'sakhi-1',
      action: 'BENEFICIARY_STATUS_CLOSED',
      entityType: 'BeneficiaryCase',
      entityId: 'ben-1',
      beforeJson: { currentStatus: 'ACTIVE' },
      afterJson: { currentStatus: 'CLOSED' },
      localAuditUuid: 'local-uuid-1',
    });
  });

  it('omits localAuditUuid from the body when not supplied', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201 });
    const client = new AuditClient();

    await client.log(
      'sakhi-1',
      'BENEFICIARY_STATUS_CLOSED',
      'BeneficiaryCase',
      'ben-1',
      {},
      {},
      'Bearer test-token',
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('localAuditUuid');
  });

  it('throws a badGateway error when audit-service is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const client = new AuditClient();

    await expect(
      client.log(
        'sakhi-1',
        'BENEFICIARY_STATUS_CLOSED',
        'BeneficiaryCase',
        'ben-1',
        {},
        {},
        'Bearer t',
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws a badGateway error when audit-service responds with a non-ok status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    const client = new AuditClient();

    await expect(
      client.log(
        'sakhi-1',
        'BENEFICIARY_STATUS_CLOSED',
        'BeneficiaryCase',
        'ben-1',
        {},
        {},
        'Bearer t',
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});
