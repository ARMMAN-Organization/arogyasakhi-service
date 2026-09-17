import { asyncHandler, ok } from '../app.module';
import type { LearnMoreService } from './learnMore.service';
import type { LearnMoreSyncService } from './learnMore.syncService';

/**
 * Learn More request handlers. Mounted under the global `api/v1` prefix by
 * `learnMore.routes.ts`.
 */
export function createLearnMoreController(
  service: LearnMoreService,
  syncService: LearnMoreSyncService,
) {
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

    syncContent: asyncHandler(async (_req, res) => {
      res.json(ok(await syncService.sync()));
    }),
  };
}
