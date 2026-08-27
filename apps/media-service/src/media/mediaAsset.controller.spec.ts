import type { Request, Response } from 'express';
import type { MediaAssetService } from './mediaAsset.service';

/**
 * Regression coverage for the checksum response bug: the DB stores checksum
 * as a `Bytes`/Buffer column (correct — see mediaAsset.service.spec.ts), but
 * a raw Buffer serializes over JSON as `{type:"Buffer",data:[...]}`, not a
 * usable string. The controller must convert it to a hex string before it
 * ever reaches `res.json()`.
 *
 * `mediaAsset.controller.ts` imports from `../app.module`, which imports
 * `./config/app-config`, which calls `process.exit(1)` at module-load time if
 * `DATABASE_URL`/`S3_BUCKET_NAME` aren't set — true in CI, unlike local dev's
 * `.env` — so they must be set before the module under test is required
 * (matches reporting-etl-service/info.controller.spec.ts's same workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
process.env.S3_BUCKET_NAME ??= 'test-bucket';

const { createMediaAssetController } =
  require('./mediaAsset.controller') as typeof import('./mediaAsset.controller');
describe('createMediaAssetController', () => {
  const checksumBuffer = Buffer.from('bf48f6236dae5154c342cf06397b396e', 'hex');
  const baseAsset = {
    id: 'asset-1',
    assetType: 'CONSENT_PHOTO',
    storageUri: 's3://bucket/key',
    checksum: checksumBuffer,
    mimeType: 'image/jpeg',
    sizeBytes: BigInt(204800),
    uploadedByUserId: null,
    uploadedAt: new Date('2026-08-18T06:00:00.000Z'),
    linkedEntityType: null,
    linkedEntityId: null,
    encryptedFlag: true,
    beneficiaryId: null,
    visitId: null,
    submissionId: null,
    referralId: null,
    followupId: null,
    eventId: null,
    createdAt: new Date('2026-08-18T06:00:00.000Z'),
    updatedAt: new Date('2026-08-18T06:00:00.000Z'),
    isDeleted: false,
    deletedAt: null,
  };

  function mockRes() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return { json, status, res: { json, status } as unknown as Response };
  }

  it('returns checksum as a hex string on finalize (POST /media)', async () => {
    const service = {
      create: jest.fn().mockResolvedValue(baseAsset),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { status, json, res } = mockRes();

    await controller.create({ body: {} } as Request, res, jest.fn());

    expect(status).toHaveBeenCalledWith(201);
    const [{ data }] = json.mock.calls[0];
    expect(data.checksum).toBe('bf48f6236dae5154c342cf06397b396e');
    expect(typeof data.checksum).toBe('string');
  });

  it('returns checksum as a hex string on list (GET /media)', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([baseAsset]),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { json, res } = mockRes();

    await controller.list({ query: {} } as unknown as Request, res, jest.fn());

    const [{ data }] = json.mock.calls[0];
    expect(data[0].checksum).toBe('bf48f6236dae5154c342cf06397b396e');
    expect(typeof data[0].checksum).toBe('string');
  });

  it('passes followupId through to service.list when given as a query param', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { res } = mockRes();

    await controller.list(
      { query: { followupId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } } as unknown as Request,
      res,
      jest.fn(),
    );

    expect(service.list).toHaveBeenCalledWith({
      followupId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
  });

  it('calls service.list with undefined when followupId is not given', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { res } = mockRes();

    await controller.list({ query: {} } as unknown as Request, res, jest.fn());

    expect(service.list).toHaveBeenCalledWith(undefined);
  });

  it('returns only viewUrl + uploadedByName on getById (GET /media/:id) — no id/mimeType/other metadata, forwarding the caller and bearer token', async () => {
    const service = {
      getById: jest.fn().mockResolvedValue({
        viewUrl: 'https://signed.example.com/view',
        uploadedByName: 'Jane Sakhi',
      }),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { json, res } = mockRes();
    const user = { id: 'user-1', roles: ['SAKHI'], projectId: null, geographyUnitId: null };
    const req = {
      params: { id: 'asset-1' },
      user,
      header: jest.fn().mockReturnValue('Bearer token-123'),
    } as unknown as Request;

    await controller.getById(req, res, jest.fn());

    expect(service.getById).toHaveBeenCalledWith('asset-1', user, 'Bearer token-123');
    const [{ data }] = json.mock.calls[0];
    expect(data).toEqual({
      viewUrl: 'https://signed.example.com/view',
      uploadedByName: 'Jane Sakhi',
    });
  });

  it('rejects with 401 on getById when req.user is missing, without calling the service', async () => {
    const service = {
      getById: jest.fn(),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { res } = mockRes();
    const req = {
      params: { id: 'asset-1' },
      user: undefined,
      header: jest.fn().mockReturnValue('Bearer token-123'),
    } as unknown as Request;
    const next = jest.fn();

    await controller.getById(req, res, next);

    expect(service.getById).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects with 401 on getById when the Authorization header is missing, without calling the service', async () => {
    const service = {
      getById: jest.fn(),
    } as unknown as jest.Mocked<MediaAssetService>;
    const controller = createMediaAssetController(service);
    const { res } = mockRes();
    const user = { id: 'user-1', roles: ['SAKHI'], projectId: null, geographyUnitId: null };
    const req = {
      params: { id: 'asset-1' },
      user,
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const next = jest.fn();

    await controller.getById(req, res, next);

    expect(service.getById).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});
