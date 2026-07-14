import { MediaAssetService } from './mediaAsset.service';
import type { MediaAssetRepository } from './mediaAsset.repository';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';
import type { MediaAsset } from '../../../../node_modules/.prisma/client-media-service';

describe('MediaAssetService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<MediaAssetRepository>;
  let service: MediaAssetService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new MediaAssetService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows: MediaAsset[] = [
      {
        id: '1',
        assetType: 'CONSENT_PHOTO',
        storageUri: 's3://bucket/consent/1.jpg',
        checksum: Buffer.from('checksum-bytes'),
        mimeType: 'image/jpeg',
        sizeBytes: 100n,
        uploadedByUserId: 'a1111111-1111-1111-1111-111111111111',
        uploadedAt: new Date(),
        linkedEntityType: 'BENEFICIARY',
        linkedEntityId: 'b2222222-2222-2222-2222-222222222222',
        encryptedFlag: true,
        beneficiaryId: 'b2222222-2222-2222-2222-222222222222',
        visitId: null,
        submissionId: null,
        referralId: null,
        followupId: null,
        eventId: null,
        createdAt: new Date(),
        createdByUserId: 'a1111111-1111-1111-1111-111111111111',
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateMediaAssetInput = {
      assetType: 'CONSENT_PHOTO',
      storageUri: 's3://bucket/consent/1.jpg',
      checksum: Buffer.from('checksum-bytes'),
      mimeType: 'image/jpeg',
      sizeBytes: 100n,
      uploadedByUserId: 'a1111111-1111-1111-1111-111111111111',
      uploadedAt: new Date(),
      linkedEntityType: 'BENEFICIARY',
      linkedEntityId: 'b2222222-2222-2222-2222-222222222222',
      encryptedFlag: true,
      beneficiaryId: 'b2222222-2222-2222-2222-222222222222',
    };
    const created: MediaAsset = {
      id: '1',
      ...dto,
      uploadedByUserId: dto.uploadedByUserId ?? null,
      linkedEntityType: dto.linkedEntityType ?? null,
      linkedEntityId: dto.linkedEntityId ?? null,
      beneficiaryId: dto.beneficiaryId ?? null,
      visitId: null,
      submissionId: null,
      referralId: null,
      followupId: null,
      eventId: null,
      createdAt: new Date(),
      createdByUserId: 'a1111111-1111-1111-1111-111111111111',
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    const dto: CreateMediaAssetInput = {
      assetType: 'CONSENT_PHOTO',
      storageUri: 's3://bucket/consent/1.jpg',
      checksum: Buffer.from('checksum-bytes'),
      mimeType: 'image/jpeg',
      sizeBytes: 100n,
      uploadedAt: new Date(),
      encryptedFlag: true,
    };
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(dto)).rejects.toThrow('db down');
  });
});
