import {
  escalationsBySakhiParamsSchema,
  escalationsBySakhiQuerySchema,
  parseEscalationTypesParam,
} from './get-escalations-by-sakhi.dto';

describe('escalationsBySakhiParamsSchema', () => {
  it('accepts a valid uuid sakhiId', () => {
    expect(
      escalationsBySakhiParamsSchema.safeParse({
        sakhiId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed sakhiId', () => {
    expect(escalationsBySakhiParamsSchema.safeParse({ sakhiId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('escalationsBySakhiQuerySchema', () => {
  it('accepts a type value', () => {
    expect(escalationsBySakhiQuerySchema.safeParse({ type: 'CLOSURE_PENDING' }).success).toBe(true);
  });

  it('rejects a missing type', () => {
    expect(escalationsBySakhiQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty type', () => {
    expect(escalationsBySakhiQuerySchema.safeParse({ type: '' }).success).toBe(false);
  });
});

describe('parseEscalationTypesParam', () => {
  it('splits and trims a comma-separated value', () => {
    expect(parseEscalationTypesParam('CLOSURE_PENDING, DELIVERY_FORM_PENDING')).toEqual([
      'CLOSURE_PENDING',
      'DELIVERY_FORM_PENDING',
    ]);
  });

  it('accepts a single value', () => {
    expect(parseEscalationTypesParam('CLOSURE_PENDING')).toEqual(['CLOSURE_PENDING']);
  });

  it('throws a 400 HttpError on an unrecognized type value', () => {
    expect(() => parseEscalationTypesParam('FOO')).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('throws a 400 HttpError when only one of multiple values is invalid', () => {
    expect(() => parseEscalationTypesParam('CLOSURE_PENDING,FOO')).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});
