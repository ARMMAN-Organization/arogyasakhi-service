import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { SupervisorService } from './supervisor.service';
import { createSupervisorController } from './supervisor.controller';
import { setManagerSchema } from './dto/set-manager.dto';
import { sendTransferNoticeSchema } from './dto/send-transfer-notice.dto';
import {
  authenticate,
  errorResponse,
  requireRoles,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const userIdParamsSchema = z
  .object({
    userId: z.string().uuid().openapi({ example: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c' }),
  })
  .strict();

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

const setManagerResponseSchema = z.object({
  userId: z.string().uuid(),
  managerUserId: z.string().uuid(),
});

const transferNoticeResponseSchema = z.object({
  sent: z.boolean(),
  managerEmail: z.string().email(),
  usedFallback: z.boolean(),
});

/**
 * Supervisor→Manager hierarchy link and Missed Visit Escalation TRANSFER
 * Manager-notice HTTP routes (FR-SV-4.3). Mounted under the global `api/v1`
 * prefix.
 */
export function registerSupervisorRoutes(
  doc: DocumentedRouter,
  service: SupervisorService,
  signer: TokenSigner,
) {
  const controller = createSupervisorController(service);

  doc.patch(
    '/supervisors/:userId/manager',
    {
      summary:
        "Set a Supervisor's designated Manager (FR-SV-4.3) — the hierarchy link " +
        'SupervisorService.resolveManagerContact walks to find who a Missed Visit Escalation ' +
        'TRANSFER emails. ADMIN-only org-data entry, one Supervisor at a time.',
      tags: ['Supervisors'],
      params: userIdParamsSchema,
      responses: {
        200: { description: 'Manager link set', schema: envelope(setManagerResponseSchema) },
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'managerUserId does not reference an existing user.' }),
        422: errorResponse(422, {
          message: 'This user does not hold an active SUPERVISOR role.',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(userIdParamsSchema, 'params'),
    validateBody(setManagerSchema),
    controller.setManager,
  );

  doc.post(
    '/supervisors/manager-transfer-notice',
    {
      summary:
        'Sends the Missed Visit Escalation TRANSFER email (FR-SV-4.3: "Email sent to ' +
        'designated Manager with Sakhi and beneficiary details") to the Sakhi\'s resolved ' +
        'Manager, falling back to a configured default address when the hierarchy link is ' +
        "missing. Intended to be called server-to-server by notification-escalation-service's " +
        "decideMissedVisit, forwarding the deciding Supervisor's own token.",
      tags: ['Supervisors'],
      responses: {
        200: {
          description: 'Notice attempted (see `sent`) — never fails just because SES did',
          schema: envelope(transferNoticeResponseSchema),
        },
        400: errorResponse(400, { message: 'sakhiId: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Sakhi not found.' }),
        502: errorResponse(502, {
          message: 'No Manager contact could be resolved and no default is configured.',
        }),
      },
    },
    authenticate(signer),
    requireRoles('SUPERVISOR', 'ADMIN'),
    validateBody(sendTransferNoticeSchema),
    controller.sendTransferNotice,
  );
}
