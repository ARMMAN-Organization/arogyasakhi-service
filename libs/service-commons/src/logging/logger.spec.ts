import { buildLoggerOptions, redactPiiFields } from './logger';

describe('redactPiiFields', () => {
  it('redacts a top-level PII field', () => {
    expect(redactPiiFields({ fullName: 'Jane Doe', id: '1' })).toEqual({
      fullName: '[Redacted]',
      id: '1',
    });
  });

  it('redacts a PII field nested at an arbitrary depth', () => {
    expect(redactPiiFields({ data: { beneficiary: { phone: '9999999999', id: '1' } } })).toEqual({
      data: { beneficiary: { phone: '[Redacted]', id: '1' } },
    });
  });

  it('matches case-insensitively and against snake_case variants', () => {
    expect(redactPiiFields({ rch_number: 'RCH1', DOB: '2000-01-01' })).toEqual({
      rch_number: '[Redacted]',
      DOB: '[Redacted]',
    });
  });

  it('redacts PII fields inside arrays', () => {
    expect(redactPiiFields([{ fullName: 'A' }, { fullName: 'B' }])).toEqual([
      { fullName: '[Redacted]' },
      { fullName: '[Redacted]' },
    ]);
  });

  it('leaves non-PII fields and primitives untouched', () => {
    expect(redactPiiFields({ id: '1', count: 3, active: true })).toEqual({
      id: '1',
      count: 3,
      active: true,
    });
  });

  it('passes through null/primitive input unchanged', () => {
    expect(redactPiiFields(null)).toBeNull();
    expect(redactPiiFields('fullName')).toBe('fullName');
    expect(redactPiiFields(42)).toBe(42);
  });

  it('does not stack-overflow on deeply nested input', () => {
    let value: unknown = { fullName: 'leaf' };
    for (let i = 0; i < 50; i++) value = { child: value };
    expect(() => redactPiiFields(value)).not.toThrow();
  });
});

describe('buildLoggerOptions', () => {
  it('redacts auth/token paths and named top-level PII body fields', () => {
    const options = buildLoggerOptions('info');
    expect(options.redact).toEqual(
      expect.objectContaining({
        paths: expect.arrayContaining([
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.token',
          '*.pii',
          'req.body.fullName',
          'req.body.phone',
          'req.body.dateOfBirth',
        ]),
        remove: true,
      }),
    );
  });
});
