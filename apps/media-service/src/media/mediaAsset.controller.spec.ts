import type { Request, Response } from 'express';
import { createMediaAssetController } from './mediaAsset.controller';
import type { MediaAssetService } from './mediaAsset.service';

/**
 * Regression coverage for the checksum response bug: the DB stores checksum
 * as a `Bytes`/Buffer column (correct — see mediaAsset.service.spec.ts), but
 * a raw Buffer serializes over JSON as `{type:"Buffer",data:[...]}`, not a
 * usable string. The controller must convert it to a hex string before it
 * ever reaches `res.json()`.
 */
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

    await controller.list({} as Request, res, jest.fn());

    const [{ data }] = json.mock.calls[0];
    expect(data[0].checksum).toBe('bf48f6236dae5154c342cf06397b396e');
    expect(typeof data[0].checksum).toBe('string');
  });
});
