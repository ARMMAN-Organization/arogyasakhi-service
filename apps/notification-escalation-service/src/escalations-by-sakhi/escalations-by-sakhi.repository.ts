import type { PrismaService } from '../prisma/prisma.service';
import type { EscalationsBySakhiType } from './dto/get-escalations-by-sakhi.dto';

/**
 * Data access for the escalations-by-sakhi roster view. Read-only projection
 * over this service's own `escalation_events` table — no cross-service
 * joins (forklift rule).
 */
export class EscalationsBySakhiRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every OPEN escalation event for any of the given beneficiaries,
   * restricted to the requested types, most recent first. OPEN-only: a
   * decided (RESOLVED/DISMISSED/etc.) CLOSURE_PENDING or
   * DELIVERY_FORM_PENDING row is no longer "pending."
   */
  findOpenByBeneficiaryIdsAndTypes(beneficiaryIds: string[], types: EscalationsBySakhiType[]) {
    return this.prisma.escalationEvent.findMany({
      where: {
        beneficiaryId: { in: beneficiaryIds },
        escalationType: { in: types },
        status: 'OPEN',
        isDeleted: false,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
