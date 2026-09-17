import { patchHealthEducationMessageSchema } from './patch-health-education-message.dto';

describe('patchHealthEducationMessageSchema', () => {
  it('accepts an empty body (no-op)', () => {
    expect(patchHealthEducationMessageSchema.parse({})).toEqual({});
  });

  it('accepts bodyMarathi alone', () => {
    const result = patchHealthEducationMessageSchema.parse({ bodyMarathi: 'नमस्कार' });
    expect(result).toEqual({ bodyMarathi: 'नमस्कार' });
  });

  it('accepts multiple content fields together', () => {
    const result = patchHealthEducationMessageSchema.parse({
      titleEn: 'Title',
      bodyEn: 'Body',
      bodyMarathi: 'शरीर',
      mediaType: 'IMAGE',
      mediaFile: 'anaemia.png',
    });
    expect(result).toEqual({
      titleEn: 'Title',
      bodyEn: 'Body',
      bodyMarathi: 'शरीर',
      mediaType: 'IMAGE',
      mediaFile: 'anaemia.png',
    });
  });

  it('rejects an empty-string bodyEn', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ bodyEn: '' })).toThrow();
  });

  it('rejects an empty-string bodyMarathi', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ bodyMarathi: '' })).toThrow();
  });

  it('rejects an invalid mediaType enum value', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ mediaType: 'PDF' })).toThrow();
  });

  it('allows titleEn/mediaFile to be explicitly nulled', () => {
    const result = patchHealthEducationMessageSchema.parse({ titleEn: null, mediaFile: null });
    expect(result).toEqual({ titleEn: null, mediaFile: null });
  });

  it('rejects a structural field (conditionLabel) — not editable via this endpoint', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ conditionLabel: 'Anemia' })).toThrow();
  });

  it('rejects a structural field (riskConditionId) — not editable via this endpoint', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ riskConditionId: 'some-id' })).toThrow();
  });

  it('rejects a structural field (stage) — not editable via this endpoint', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ stage: 'ANC' })).toThrow();
  });

  it('rejects a structural field (messageOrder) — not editable via this endpoint', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ messageOrder: 2 })).toThrow();
  });

  it('rejects a structural field (sortOrder) — not editable via this endpoint', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ sortOrder: 5 })).toThrow();
  });

  it('rejects an unknown field (.strict())', () => {
    expect(() => patchHealthEducationMessageSchema.parse({ foo: 'bar' })).toThrow();
  });
});
