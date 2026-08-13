import { notFound } from '@armman/service-commons';
import { asyncHandler, ok } from '../app.module';
import type { EscalationService } from './escalation.service';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';

/**
 * Escalation event request handlers. Mounted under the global `api/v1`
 * prefix by `escalation.routes.ts`.
 */
export function createEscalationController(service: EscalationService) {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as ListEscalationEventsInput;
      res.json(ok(await service.list(query)));
    }),

    findById: asyncHandler(async (req, res) => {
      const card = await service.findById(req.params.id);
      if (!card) throw notFound('Escalation event not found.');
      res.json(ok(card));
    }),
  };
}
