import { LearnMoreSyncService } from './learnMore.syncService';
import type { LearnMoreStrapiClient, StrapiSection } from './learnMore.strapiClient';
import type { PrismaService } from '../prisma/prisma.service';

function buildSection(overrides: Partial<StrapiSection> = {}): StrapiSection {
  return {
    documentId: 'sec-doc-1',
    slug: 'anemia',
    name: 'Anemia',
    sortOrder: 0,
    topics: [],
    ...overrides,
  };
}

describe('LearnMoreSyncService', () => {
  let prisma: { learnMoreSection: { upsert: jest.Mock }; learnMoreTopic: { upsert: jest.Mock } };
  let strapiClient: jest.Mocked<Pick<LearnMoreStrapiClient, 'fetchSections' | 'resolveMediaUrl'>>;
  let service: LearnMoreSyncService;

  beforeEach(() => {
    prisma = {
      learnMoreSection: { upsert: jest.fn() },
      learnMoreTopic: { upsert: jest.fn() },
    };
    strapiClient = {
      fetchSections: jest.fn(),
      resolveMediaUrl: jest.fn((url: string) => `http://localhost:1337${url}`),
    };
    service = new LearnMoreSyncService(
      prisma as unknown as PrismaService,
      strapiClient as unknown as LearnMoreStrapiClient,
    );
  });

  it('upserts a new section by slug', async () => {
    strapiClient.fetchSections.mockResolvedValue([buildSection()]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });

    const summary = await service.sync();

    expect(prisma.learnMoreSection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sectionCode: 'anemia' },
        create: expect.objectContaining({ sectionCode: 'anemia', sectionName: 'Anemia' }),
      }),
    );
    expect(summary.sectionsSynced).toBe(1);
  });

  it('upserts a topic with media and stores the absolute content URL', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        topics: [
          {
            documentId: 'topic-doc-1',
            slug: 'anemia-video',
            title: 'Anemia video',
            mediaType: 'video',
            qnaText: null,
            mediaFile: { url: '/uploads/anemia.mp4' },
            sortOrder: 0,
          },
        ],
      }),
    ]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });
    prisma.learnMoreTopic.upsert.mockResolvedValue({ id: 'db-topic-1' });

    const summary = await service.sync();

    expect(prisma.learnMoreTopic.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { topicCode: 'anemia-video' },
        create: expect.objectContaining({
          topicCode: 'anemia-video',
          mediaType: 'VIDEO',
          contentUrl: 'http://localhost:1337/uploads/anemia.mp4',
          sectionId: 'db-section-1',
        }),
      }),
    );
    expect(summary.topicsSynced).toBe(1);
  });

  it('syncs a qna_text topic with no media as a null contentUrl', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        topics: [
          {
            documentId: 'topic-doc-2',
            slug: 'anemia-qna',
            title: 'Anemia QnA',
            mediaType: 'qna_text',
            qnaText: 'Some text',
            mediaFile: null,
            sortOrder: 0,
          },
        ],
      }),
    ]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });
    prisma.learnMoreTopic.upsert.mockResolvedValue({ id: 'db-topic-1' });

    const summary = await service.sync();

    expect(prisma.learnMoreTopic.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ mediaType: 'QNA_TEXT', contentUrl: null }),
      }),
    );
    expect(summary.topicsSynced).toBe(1);
    expect(summary.skipped).toEqual([]);
  });

  it('skips a topic with an unrecognized mediaType and continues syncing others', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        topics: [
          {
            documentId: 'topic-doc-3',
            slug: 'bad-type',
            title: 'Bad type topic',
            mediaType: 'powerpoint',
            qnaText: null,
            mediaFile: null,
            sortOrder: 0,
          },
        ],
      }),
    ]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });

    const summary = await service.sync();

    expect(prisma.learnMoreTopic.upsert).not.toHaveBeenCalled();
    expect(summary.topicsSynced).toBe(0);
    expect(summary.skipped).toEqual([
      { type: 'topic', name: 'Bad type topic', reason: 'unrecognized mediaType "powerpoint"' },
    ]);
  });

  it('skips a media-backed topic missing its mediaFile', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        topics: [
          {
            documentId: 'topic-doc-4',
            slug: 'video-no-file',
            title: 'Video no file',
            mediaType: 'video',
            qnaText: null,
            mediaFile: null,
            sortOrder: 0,
          },
        ],
      }),
    ]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });

    const summary = await service.sync();

    expect(prisma.learnMoreTopic.upsert).not.toHaveBeenCalled();
    expect(summary.skipped).toEqual([
      {
        type: 'topic',
        name: 'Video no file',
        reason: 'mediaType "video" requires a mediaFile but none is uploaded',
      },
    ]);
  });

  it('skips a section missing a slug and does not sync its topics', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        slug: null,
        topics: [
          {
            documentId: 'topic-doc-5',
            slug: 'orphan-topic',
            title: 'Orphan topic',
            mediaType: 'qna_text',
            qnaText: 'x',
            mediaFile: null,
            sortOrder: 0,
          },
        ],
      }),
    ]);

    const summary = await service.sync();

    expect(prisma.learnMoreSection.upsert).not.toHaveBeenCalled();
    expect(prisma.learnMoreTopic.upsert).not.toHaveBeenCalled();
    expect(summary.skipped).toEqual([{ type: 'section', name: 'Anemia', reason: 'missing slug' }]);
  });

  it('skips a topic missing a slug', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        topics: [
          {
            documentId: 'topic-doc-6',
            slug: null,
            title: 'No slug topic',
            mediaType: 'qna_text',
            qnaText: 'x',
            mediaFile: null,
            sortOrder: 0,
          },
        ],
      }),
    ]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });

    const summary = await service.sync();

    expect(prisma.learnMoreTopic.upsert).not.toHaveBeenCalled();
    expect(summary.skipped).toEqual([
      { type: 'topic', name: 'No slug topic', reason: 'missing slug' },
    ]);
  });

  it('returns a summary reflecting a mixed batch of synced and skipped items', async () => {
    strapiClient.fetchSections.mockResolvedValue([
      buildSection({
        slug: 'section-a',
        topics: [
          {
            documentId: 't1',
            slug: 'topic-a',
            title: 'Topic A',
            mediaType: 'qna_text',
            qnaText: 'x',
            mediaFile: null,
            sortOrder: 0,
          },
          {
            documentId: 't2',
            slug: null,
            title: 'Topic B (no slug)',
            mediaType: 'qna_text',
            qnaText: 'x',
            mediaFile: null,
            sortOrder: 1,
          },
        ],
      }),
    ]);
    prisma.learnMoreSection.upsert.mockResolvedValue({ id: 'db-section-1' });
    prisma.learnMoreTopic.upsert.mockResolvedValue({ id: 'db-topic-1' });

    const summary = await service.sync();

    expect(summary).toEqual({
      sectionsSynced: 1,
      topicsSynced: 1,
      skipped: [{ type: 'topic', name: 'Topic B (no slug)', reason: 'missing slug' }],
    });
  });

  it('propagates a Strapi client failure without partial success', async () => {
    strapiClient.fetchSections.mockRejectedValue(
      Object.assign(new Error('unreachable'), { status: 502 }),
    );

    await expect(service.sync()).rejects.toMatchObject({ status: 502 });
    expect(prisma.learnMoreSection.upsert).not.toHaveBeenCalled();
  });
});
