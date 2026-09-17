import { generateUniqueId } from './beneficiary.unique-id';

describe('generateUniqueId', () => {
  it('formats State(2)-District(3)-Block(3)-ID(6), truncating and uppercasing real geoCode values', () => {
    const result = generateUniqueId(
      { stateCode: 'MH', districtCode: 'NANDURBAR', blockCode: 'DHADGAON' },
      123n,
    );

    expect(result).toBe('MH-NAN-DHA-000123');
  });

  it('zero-pads the sequence to exactly 6 digits', () => {
    expect(
      generateUniqueId({ stateCode: 'MH', districtCode: 'PALGHAR', blockCode: 'JAWHAR' }, 1n),
    ).toBe('MH-PAL-JAW-000001');
  });

  it('does not truncate the sequence, even beyond 6 digits', () => {
    expect(
      generateUniqueId({ stateCode: 'MH', districtCode: 'PALGHAR', blockCode: 'JAWHAR' }, 1234567n),
    ).toBe('MH-PAL-JAW-1234567');
  });

  it('right-pads a code shorter than its required width with "X"', () => {
    expect(generateUniqueId({ stateCode: 'M', districtCode: 'NA', blockCode: 'D' }, 5n)).toBe(
      'MX-NAX-DXX-000005',
    );
  });

  it('lowercases input is uppercased in the output', () => {
    expect(
      generateUniqueId({ stateCode: 'mh', districtCode: 'nandurbar', blockCode: 'dhadgaon' }, 1n),
    ).toBe('MH-NAN-DHA-000001');
  });

  it('produces distinct ids for two blocks that truncate to the same 3-char prefix, via the sequence', () => {
    const first = generateUniqueId(
      { stateCode: 'MH', districtCode: 'PALGHAR', blockCode: 'KHODALA' },
      1n,
    );
    const second = generateUniqueId(
      { stateCode: 'MH', districtCode: 'PALGHAR', blockCode: 'KHOPOLI' },
      2n,
    );

    // Same truncated prefix (both blocks start "KHO") is fine — the sequence
    // still guarantees the full id is unique.
    expect(first).toBe('MH-PAL-KHO-000001');
    expect(second).toBe('MH-PAL-KHO-000002');
    expect(first).not.toBe(second);
  });
});
