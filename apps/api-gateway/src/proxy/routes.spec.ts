/**
 * `routes.ts` imports `appConfig`, which calls `process.exit(1)` at
 * module-load time if `JWT_PUBLIC_KEY` isn't set — true in CI, unlike local
 * dev's `.env` — so it must be set before the module under test is required.
 */
process.env.JWT_PUBLIC_KEY ??= 'test-key';

const { SERVICE_ROUTES } = require('./routes') as typeof import('./routes');

describe('SERVICE_ROUTES ordering', () => {
  it('registers /visits/by-sakhi before the generic /visits prefix', () => {
    const bySakhiIndex = SERVICE_ROUTES.findIndex((r) => r.prefix === '/visits/by-sakhi');
    const visitsIndex = SERVICE_ROUTES.findIndex((r) => r.prefix === '/visits');

    expect(bySakhiIndex).toBeGreaterThanOrEqual(0);
    expect(visitsIndex).toBeGreaterThanOrEqual(0);
    expect(bySakhiIndex).toBeLessThan(visitsIndex);
  });

  it('registers /beneficiaries/:beneficiaryId/delivery-outcomes before the generic /beneficiaries prefix', () => {
    const deliveryOutcomesIndex = SERVICE_ROUTES.findIndex(
      (r) => r.prefix === '/beneficiaries/:beneficiaryId/delivery-outcomes',
    );
    const beneficiariesIndex = SERVICE_ROUTES.findIndex((r) => r.prefix === '/beneficiaries');

    expect(deliveryOutcomesIndex).toBeGreaterThanOrEqual(0);
    expect(beneficiariesIndex).toBeGreaterThanOrEqual(0);
    expect(deliveryOutcomesIndex).toBeLessThan(beneficiariesIndex);
  });
});
