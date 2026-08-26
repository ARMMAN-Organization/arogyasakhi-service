import { LearnMoreService } from './learnMore.service';
import type { LearnMoreRepository } from './learnMore.repository';

function buildSection(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'section-1',
    sectionCode: 'COMING_SOON',
    sectionName: 'Content coming soon',
    sortOrder: 0,
    ...overrides,
  };
}

function buildTopic(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'topic-1',
    topicCode: 'COMING_SOON',
    topicName: 'Content coming soon',
    mediaType: 'QNA_TEXT',
    contentUrl: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('LearnMoreService', () => {
  const repository = {
    findAllActiveSections: jest.fn(),
    findSectionByCode: jest.fn(),
    findTopicsBySectionId: jest.fn(),
    findTopicByCode: jest.fn(),
  } as unknown as jest.Mocked<LearnMoreRepository>;
  let service: LearnMoreService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new LearnMoreService(repository);
  });

  describe('listSections', () => {
    it('returns every active section from the repository', async () => {
      const sections = [buildSection()];
      repository.findAllActiveSections.mockResolvedValue(sections as never);

      const result = await service.listSections();

      expect(result).toEqual(sections);
    });

    it('returns an empty array without throwing when no sections are seeded', async () => {
      repository.findAllActiveSections.mockResolvedValue([]);

      const result = await service.listSections();

      expect(result).toEqual([]);
    });
  });

  describe('listTopicsBySectionCode', () => {
    it('resolves the section then returns its topics', async () => {
      const section = buildSection({ id: 'section-1' });
      const topics = [buildTopic({ id: 'topic-1' })];
      repository.findSectionByCode.mockResolvedValue(section as never);
      repository.findTopicsBySectionId.mockResolvedValue(topics as never);

      const result = await service.listTopicsBySectionCode('COMING_SOON');

      expect(repository.findSectionByCode).toHaveBeenCalledWith('COMING_SOON');
      expect(repository.findTopicsBySectionId).toHaveBeenCalledWith('section-1');
      expect(result).toEqual(topics);
    });

    it('throws a 404 when the section code does not resolve', async () => {
      repository.findSectionByCode.mockResolvedValue(null);

      await expect(service.listTopicsBySectionCode('UNKNOWN')).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.findTopicsBySectionId).not.toHaveBeenCalled();
    });
  });

  describe('getTopicByCode', () => {
    it('returns the resolved topic', async () => {
      const topic = buildTopic();
      repository.findTopicByCode.mockResolvedValue(topic as never);

      const result = await service.getTopicByCode('COMING_SOON');

      expect(result).toEqual(topic);
    });

    it('throws a 404 when the topic code does not resolve', async () => {
      repository.findTopicByCode.mockResolvedValue(null);

      await expect(service.getTopicByCode('UNKNOWN')).rejects.toMatchObject({ status: 404 });
    });
  });
});
