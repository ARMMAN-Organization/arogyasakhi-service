import { RuleVersionService } from './ruleVersion.service';
import type { RuleVersionRepository } from './ruleVersion.repository';

describe('RuleVersionService', () => {
  const repository = {
    findSetById: jest.fn(),
    findPublishedBySetId: jest.fn(),
    countVersions: jest.fn(),
    publishNewVersion: jest.fn(),
  } as unknown as jest.Mocked<RuleVersionRepository>;
  let service: RuleVersionService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RuleVersionService(repository);
  });

  const setId = '99999999-9999-9999-9999-999999999999';

  describe('getPublished', () => {
    it('returns the published version (projected), dropping checksum/audit columns', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.findPublishedBySetId.mockResolvedValue({
        id: 'ver-1',
        ruleSetId: setId,
        versionNo: 'v3',
        rulesJson: { rules: [] },
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        publishedByUserId: 'admin-1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
        createdByUserId: 'admin-1',
        isDeleted: false,
      } as never);

      const result = await service.getPublished(setId);

      expect(result).toEqual({
        id: 'ver-1',
        ruleSetId: setId,
        versionNo: 'v3',
        rulesJson: { rules: [] },
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        publishedByUserId: 'admin-1',
        status: 'PUBLISHED',
      });
      expect(result).not.toHaveProperty('checksum');
      expect(result).not.toHaveProperty('createdByUserId');
    });

    it('throws 404 when the rule set does not exist', async () => {
      repository.findSetById.mockResolvedValue(null);
      await expect(service.getPublished('missing')).rejects.toMatchObject({ status: 404 });
      expect(repository.findPublishedBySetId).not.toHaveBeenCalled();
    });

    it('throws 404 when the set exists but has no published version', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.findPublishedBySetId.mockResolvedValue(null);
      await expect(service.getPublished(setId)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('publish', () => {
    it('creates a new PUBLISHED version with the next version number and a checksum', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.countVersions.mockResolvedValue(2);
      repository.publishNewVersion.mockImplementation(
        async (data) => ({ id: 'ver-3', ...data, status: 'PUBLISHED' }) as never,
      );

      const result = await service.publish(setId, { rulesJson: { rules: [1] } }, 'admin-1');

      const arg = repository.publishNewVersion.mock.calls[0][0];
      expect(arg.ruleSetId).toBe(setId);
      expect(arg.versionNo).toBe('v3'); // countVersions 2 -> next is v3
      expect(arg.publishedByUserId).toBe('admin-1');
      expect(Buffer.isBuffer(arg.checksum)).toBe(true); // computed SHA-256
      expect(result).toMatchObject({ status: 'PUBLISHED', ruleSetId: setId });
      expect(result).not.toHaveProperty('checksum');
    });

    it('throws 404 when publishing to an unknown rule set', async () => {
      repository.findSetById.mockResolvedValue(null);
      await expect(service.publish('missing', { rulesJson: {} }, 'admin-1')).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.publishNewVersion).not.toHaveBeenCalled();
    });
  });
});
