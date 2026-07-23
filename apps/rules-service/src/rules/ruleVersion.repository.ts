import type { PrismaService } from '../prisma/prisma.service';

export interface CreatePublishedVersionData {
  ruleSetId: string;
  versionNo: string;
  rulesJson: unknown;
  checksum: Buffer;
  effectiveFrom: Date;
  publishedByUserId: string | null;
}

/**
 * Data access for rule_versions — the published-version read and the
 * publish-a-new-version transaction. Only this service's own tables are
 * touched (forklift rule).
 */
export class RuleVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The rule set itself, or null — used to 404 on an unknown :setId. */
  findSetById(ruleSetId: string) {
    return this.prisma.ruleSet.findFirst({ where: { id: ruleSetId, isDeleted: false } });
  }

  /**
   * The currently-PUBLISHED version for a rule set (the one still in effect,
   * i.e. effectiveTo is null), or null if the set has never been published.
   */
  findPublishedBySetId(ruleSetId: string) {
    return this.prisma.ruleVersion.findFirst({
      where: { ruleSetId, status: 'PUBLISHED', effectiveTo: null, isDeleted: false },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  countVersions(ruleSetId: string) {
    return this.prisma.ruleVersion.count({ where: { ruleSetId } });
  }

  /**
   * Publishes a new version atomically: retires whichever version is currently
   * PUBLISHED (status -> RETIRED, effectiveTo = the new version's effectiveFrom)
   * and inserts the new PUBLISHED row. Both happen in one transaction so a
   * rule set never has two concurrently-effective published versions.
   */
  async publishNewVersion(data: CreatePublishedVersionData) {
    return this.prisma.$transaction(async (tx) => {
      await tx.ruleVersion.updateMany({
        where: { ruleSetId: data.ruleSetId, status: 'PUBLISHED', effectiveTo: null },
        data: { status: 'RETIRED', effectiveTo: data.effectiveFrom },
      });

      return tx.ruleVersion.create({
        data: {
          ruleSetId: data.ruleSetId,
          versionNo: data.versionNo,
          rulesJson: data.rulesJson as never,
          checksum: data.checksum,
          effectiveFrom: data.effectiveFrom,
          publishedByUserId: data.publishedByUserId,
          status: 'PUBLISHED',
        },
      });
    });
  }
}
