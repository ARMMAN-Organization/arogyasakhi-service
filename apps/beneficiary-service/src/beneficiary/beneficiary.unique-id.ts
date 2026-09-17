const STATE_CODE_LENGTH = 2;
const DISTRICT_CODE_LENGTH = 3;
const BLOCK_CODE_LENGTH = 3;
const SEQUENCE_LENGTH = 6;
/** Right-pad filler for a real geoCode shorter than its required width — chosen
 * because it can't be mistaken for a real alphabetic geoCode segment (no
 * seeded geoCode in this codebase uses "X" as a trailing character today). */
const PAD_CHAR = 'X';

function truncateAndPad(code: string, length: number): string {
  const normalized = code.trim().toUpperCase();
  return normalized.length >= length
    ? normalized.slice(0, length)
    : normalized.padEnd(length, PAD_CHAR);
}

/**
 * Formats the SRS "Unique ID" field (docs/Arogya_Sakhi_SRS_v3.0.md:403):
 * State(2)-District(3)-Block(3)-ID(6), e.g. "MH-NAN-DHA-000123". Real
 * geoCode values in this codebase are full names (e.g. "NANDURBAR",
 * "DHADGAON"), not pre-shortened — each is truncated to its required width,
 * or right-padded with "X" if shorter. The ID(6) segment is a global,
 * never-reset sequence (see BeneficiaryRepository.nextUniqueIdSequence) —
 * collisions on a truncated/padded State-District-Block prefix (e.g. two
 * differently-named blocks both starting "KHO") are harmless, since the
 * trailing sequence value still makes the full id unique.
 */
export function generateUniqueId(
  codes: { stateCode: string; districtCode: string; blockCode: string },
  sequence: bigint,
): string {
  const state = truncateAndPad(codes.stateCode, STATE_CODE_LENGTH);
  const district = truncateAndPad(codes.districtCode, DISTRICT_CODE_LENGTH);
  const block = truncateAndPad(codes.blockCode, BLOCK_CODE_LENGTH);
  const seq = sequence.toString().padStart(SEQUENCE_LENGTH, '0');

  return `${state}-${district}-${block}-${seq}`;
}
