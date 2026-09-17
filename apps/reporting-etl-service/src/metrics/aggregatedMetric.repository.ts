import type { PrismaService } from '../prisma/prisma.service';

export interface AggregatedMetricUpsertInput {
  featureArea: string;
  metricName: string;
  periodStart: Date;
  periodEnd: Date;
  value?: number | null;
  breakdownJson?: unknown;
}

/**
 * Data access for computed metrics — see the Prisma schema's own comment on
 * `AggregatedMetric` for why this is an interim Postgres store rather than
 * the ClickHouse warehouse the SRS actually specifies.
 */
export class AggregatedMetricRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upserts one computed metric for a (featureArea, metricName, period)
   * triple — re-running the aggregation job for an already-computed period
   * replaces that row in place rather than accumulating duplicates.
   */
  upsert(input: AggregatedMetricUpsertInput) {
    const key = {
      featureArea_metricName_periodStart_periodEnd: {
        featureArea: input.featureArea,
        metricName: input.metricName,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    };
    const data = {
      featureArea: input.featureArea,
      metricName: input.metricName,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      value: input.value ?? null,
      breakdownJson: input.breakdownJson ?? undefined,
    };
    return this.prisma.aggregatedMetric.upsert({ where: key, create: data, update: data });
  }
}
