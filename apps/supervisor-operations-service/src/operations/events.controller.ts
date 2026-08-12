import { asyncHandler, ok, unauthorized } from '../app.module';
import type { OperationsService } from './operations.service';

/**
 * Supervisor event request handlers. Mounted under the global `api/v1`
 * prefix by `events.routes.ts`.
 */
export function createEventsController(service: OperationsService) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json(ok(await service.listEvents(req.query)));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createEvent(req.body, req.user);
      res.status(201).json(ok(created));
    }),

    getById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getEvent(req.params.id, req.user)));
    }),

    cancel: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.cancelEvent(req.params.id, req.user)));
    }),

    complete: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.completeEvent(req.params.id, req.user)));
    }),

    getAttendance: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getEventAttendance(req.params.id, req.user)));
    }),

    updateAttendance: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.updateEventAttendance(req.params.id, req.body, req.user)));
    }),

    reschedule: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.rescheduleEvent(req.params.id, req.body, req.user)));
    }),

    addPhoto: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.addEventPhoto(req.params.id, req.body, req.user);
      res.status(201).json(ok(created));
    }),

    createGathering: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createGathering(req.params.id, req.body, req.user);
      res.status(201).json(ok(created));
    }),
  };
}
