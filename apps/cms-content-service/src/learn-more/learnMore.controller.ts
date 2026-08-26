import { asyncHandler, ok } from '../app.module';
import type { LearnMoreService } from './learnMore.service';

/**
 * Learn More request handlers. Mounted under the global `api/v1` prefix by
 * `learnMore.routes.ts`.
 */
export function createLearnMoreController(service: LearnMoreService) {
  return {
    listSections: asyncHandler(async (_req, res) => {
      res.json(ok(await service.listSections()));
    }),

    listTopicsBySection: asyncHandler(async (req, res) => {
      res.json(ok(await service.listTopicsBySectionCode(req.params.sectionCode)));
    }),

    getTopic: asyncHandler(async (req, res) => {
      res.json(ok(await service.getTopicByCode(req.params.topicCode)));
    }),
  };
}
