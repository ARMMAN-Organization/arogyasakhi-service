import type { RequestHandler } from 'express';
import type { ZodTypeAny, infer as ZodInfer } from 'zod';
import { badRequest } from './http-error';

type Target = 'body' | 'query' | 'params';

/** Attached to the handler returned by `validate`/`validateBody` so the
 * OpenAPI doc router can recover the schema + target without the caller
 * repeating them — see `docs/documented-router.ts`'s `extractValidation`. */
export interface ValidationMarker {
  __validationTarget: Target;
  __validationSchema: ZodTypeAny;
}

/**
 * Validates a part of the request against a Zod schema and replaces it with the
 * parsed (and coerced) value. Rejects with 400 VALIDATION_ERROR on failure.
 * Use `.strict()` schemas to reject unknown fields.
 */
export function validate<TSchema extends ZodTypeAny>(
  schema: TSchema,
  target: Target = 'body',
): RequestHandler & ValidationMarker {
  const handler: RequestHandler & Partial<ValidationMarker> = (req, _res, next) => {
    const parsed = schema.safeParse(req[target]);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join('.') || target}: ${i.message}`)
        .join('; ');
      return next(badRequest(message));
    }
    req[target] = parsed.data as ZodInfer<TSchema>;
    next();
  };
  handler.__validationTarget = target;
  handler.__validationSchema = schema;
  return handler as RequestHandler & ValidationMarker;
}

/** Shorthand for validating the request body. */
export const validateBody = <TSchema extends ZodTypeAny>(
  schema: TSchema,
): RequestHandler & ValidationMarker => validate(schema, 'body');
