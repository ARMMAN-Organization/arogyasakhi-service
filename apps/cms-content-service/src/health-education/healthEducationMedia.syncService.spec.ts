import { HealthEducationMediaSyncService } from './healthEducationMedia.syncService';
import type {
  HealthEducationMediaStrapiClient,
  StrapiHealthEducationMedia,
} from './healthEducationMedia.strapiClient';
import type { PrismaService } from '../prisma/prisma.service';

function buildEntry(
  overrides: Partial<StrapiHealthEducationMedia> = {},
): StrapiHealthEducationMedia {
  return {
    documentId: 'm1',
    slug: 'anaemia',
    mediaFile: { url: '/uploads/anaemia.jpg' },
    ...overrides,
  };
}

describe('HealthEducationMediaSyncService', () => {
  let prisma: { healthEducationMessage: { updateMany: jest.Mock } };
  let strapiClient: jest.Mocked<
    Pick<HealthEducationMediaStrapiClient, 'fetchMediaEntries' | 'resolveMediaUrl'>
  >;
  let service: HealthEducationMediaSyncService;

  beforeEach(() => {
    prisma = { healthEducationMessage: { updateMany: jest.fn() } };
    strapiClient = {
      fetchMediaEntries: jest.fn(),
      resolveMediaUrl: jest.fn((url: string) => `http://localhost:1337${url}`),
    };
    service = new HealthEducationMediaSyncService(
      prisma as unknown as PrismaService,
      strapiClient as unknown as HealthEducationMediaStrapiClient,
    );
  });

  it('resolves an entry and updates every matching message row', async () => {
    strapiClient.fetchMediaEntries.mockResolvedValue([buildEntry()]);
    prisma.healthEducationMessage.updateMany.mockResolvedValue({ count: 2 });

    const summary = await service.sync();

    expect(prisma.healthEducationMessage.updateMany).toHaveBeenCalledWith({
      where: { mediaFile: 'anaemia', isDeleted: false },
      data: { mediaResolvedUrl: 'http://localhost:1337/uploads/anaemia.jpg' },
    });
    expect(summary).toEqual({ entriesResolved: 1, messagesUpdated: 2, skipped: [] });
  });

  it('skips an entry missing a slug', async () => {
    strapiClient.fetchMediaEntries.mockResolvedValue([buildEntry({ slug: null })]);

    const summary = await service.sync();

    expect(prisma.healthEducationMessage.updateMany).not.toHaveBeenCalled();
    expect(summary).toEqual({
      entriesResolved: 0,
      messagesUpdated: 0,
      skipped: [{ slug: null, reason: 'missing slug' }],
    });
  });

  it('skips an entry with no mediaFile uploaded in Strapi', async () => {
    strapiClient.fetchMediaEntries.mockResolvedValue([buildEntry({ mediaFile: null })]);

    const summary = await service.sync();

    expect(prisma.healthEducationMessage.updateMany).not.toHaveBeenCalled();
    expect(summary.skipped).toEqual([
      { slug: 'anaemia', reason: 'no mediaFile uploaded in Strapi' },
    ]);
  });

  it('skips an entry whose slug matches no HealthEducationMessage row', async () => {
    strapiClient.fetchMediaEntries.mockResolvedValue([buildEntry({ slug: 'orphan-slug' })]);
    prisma.healthEducationMessage.updateMany.mockResolvedValue({ count: 0 });

    const summary = await service.sync();

    expect(summary.entriesResolved).toBe(0);
    expect(summary.skipped).toEqual([
      { slug: 'orphan-slug', reason: 'no HealthEducationMessage row has this mediaFile value' },
    ]);
  });

  it('returns a summary reflecting a mixed batch of resolved and skipped entries', async () => {
    strapiClient.fetchMediaEntries.mockResolvedValue([
      buildEntry({ slug: 'anaemia' }),
      buildEntry({ slug: null }),
      buildEntry({ slug: 'family-planning', mediaFile: null }),
    ]);
    prisma.healthEducationMessage.updateMany.mockResolvedValue({ count: 1 });

    const summary = await service.sync();

    expect(summary).toEqual({
      entriesResolved: 1,
      messagesUpdated: 1,
      skipped: [
        { slug: null, reason: 'missing slug' },
        { slug: 'family-planning', reason: 'no mediaFile uploaded in Strapi' },
      ],
    });
  });

  it('propagates a Strapi client failure without partial success', async () => {
    strapiClient.fetchMediaEntries.mockRejectedValue(
      Object.assign(new Error('unreachable'), { status: 502 }),
    );

    await expect(service.sync()).rejects.toMatchObject({ status: 502 });
    expect(prisma.healthEducationMessage.updateMany).not.toHaveBeenCalled();
  });
});
