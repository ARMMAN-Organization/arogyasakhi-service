import { asyncHandler, ok, unauthorized } from '../app.module';
import type { OperationsService } from './operations.service';

/**
 * Inventory item/transaction request handlers. Mounted under the global
 * `api/v1` prefix by `inventory.routes.ts`.
 */
export function createInventoryController(service: OperationsService) {
  return {
    listItems: asyncHandler(async (_req, res) => {
      res.json(ok(await service.listInventoryItems()));
    }),

    createItem: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createInventoryItem(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),

    listTransactions: asyncHandler(async (_req, res) => {
      res.json(ok(await service.listInventoryTransactions()));
    }),

    getTransactionById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getInventoryTransactionById(req.params.id, req.user)));
    }),

    listTransactionsBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(
          await service.listInventoryTransactionsBySakhi(
            req.params.sakhiId,
            req.user,
            authorizationHeader,
          ),
        ),
      );
    }),

    createTransactions: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.createInventoryTransactions(
        req.body,
        req.user,
        authorizationHeader,
      );
      res.status(201).json(ok(created));
    }),

    updateTransaction: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.updateInventoryTransaction(req.params.id, req.body, req.user);
      res.json(ok(updated));
    }),

    deleteTransaction: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      await service.deleteInventoryTransaction(req.params.id, req.user);
      res.json(ok({ deleted: true }));
    }),
  };
}
