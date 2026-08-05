import type { PrismaService } from '../prisma/prisma.service';

export interface CreatePublishedVersionData {
  ruleSetId: string;
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

  /** One rule version by its own id, or null — used by other services to verify a version is usable. */
  findById(id: string) {
    return this.prisma.ruleVersion.findFirst({ where: { id, isDeleted: false } });
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

  /**
   * Publishes a new version atomically: counts existing versions to derive the
   * next versionNo, retires whichever version is currently PUBLISHED (status ->
   * RETIRED, effectiveTo = the new version's effectiveFrom), and inserts the new
   * PUBLISHED row — all inside one SERIALIZABLE transaction.
   *
   * The count-then-insert must happen under the same transaction (not read
   * beforehand by the caller, as it previously was) so a rule set never has two
   * concurrently-effective published versions. SERIALIZABLE closes the
   * versionNo race: if two publish() calls for the same rule set overlap,
   * Postgres aborts one with a serialization failure (Prisma P2034) rather than
   * letting both compute the same `v${existingCount + 1}` and silently collide
   * on `@@unique([ruleSetId, versionNo])`. The service layer catches P2034 (and
   * P2002, belt-and-suspenders) and turns it into a clean 409 instead of an
   * uncaught 500.
   */
  async publishNewVersion(data: CreatePublishedVersionData) {
    return this.prisma.$transaction(
      async (tx) => {
        const existingCount = await tx.ruleVersion.count({ where: { ruleSetId: data.ruleSetId } });

        await tx.ruleVersion.updateMany({
          where: { ruleSetId: data.ruleSetId, status: 'PUBLISHED', effectiveTo: null },
          data: { status: 'RETIRED', effectiveTo: data.effectiveFrom },
        });

        return tx.ruleVersion.create({
          data: {
            ruleSetId: data.ruleSetId,
            versionNo: `v${existingCount + 1}`,
            rulesJson: data.rulesJson as never,
            checksum: data.checksum,
            effectiveFrom: data.effectiveFrom,
            publishedByUserId: data.publishedByUserId,
            status: 'PUBLISHED',
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
