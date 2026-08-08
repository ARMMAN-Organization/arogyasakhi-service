import type { PrismaService } from '../prisma/prisma.service';

/** Data access for incentive rates. Owns only this service's `incentive_rates` table. */
export class IncentiveRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Looks up a rate by id — used by IncentiveEventService.create to
   * re-derive amountInr server-side rather than trust a client-supplied
   * value (see createIncentiveEventSchema's doc comment).
   */
  findById(id: string) {
    return this.prisma.incentiveRate.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Finds the rate effective as of `asOf` for a rate/referral type,
   * preferring a geography-specific rate over a global one (`geographyUnitId:
   * null`) when both exist. Ordering geography-specific first, then by
   * `effectiveFrom` descending, means `findFirst` naturally returns the most
   * specific, most recent applicable rate.
   */
  findActiveRate(
    rateType: string,
    referralType: string | undefined,
    geographyUnitId: string | undefined,
    asOf: Date,
  ) {
    return this.prisma.incentiveRate.findFirst({
      where: {
        rateType: rateType as never,
        referralType: (referralType ?? null) as never,
        isDeleted: false,
        effectiveFrom: { lte: asOf },
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
          geographyUnitId
            ? { OR: [{ geographyUnitId }, { geographyUnitId: null }] }
            : { geographyUnitId: null },
        ],
      },
      orderBy: [{ geographyUnitId: { sort: 'desc', nulls: 'last' } }, { effectiveFrom: 'desc' }],
    });
  }
}
