import { Router } from 'express';
import {
  asyncHandler,
  badGateway,
  ok,
  requireRoles,
  type AuthenticatedUser,
  type TokenSigner,
} from '@armman/service-commons';
import {
  authenticateGateway,
  degrade,
  fetchJson,
  postJson,
  resolveSakhiAndAuthorize,
} from '../dashboard/dashboard.controller';

// Read directly from process.env — see dashboard.controller.ts for why.
const BENEFICIARY_SERVICE_URL = process.env.BENEFICIARY_SERVICE_URL ?? 'http://localhost:3001';
const VISIT_FORM_SERVICE_URL = process.env.VISIT_FORM_SERVICE_URL ?? 'http://localhost:3003';
const RISK_REFERRAL_SERVICE_URL = process.env.RISK_REFERRAL_SERVICE_URL ?? 'http://localhost:3005';

interface PadaBeneficiary {
  id: string;
  caseType: 'MOTHER' | 'CHILD';
}

interface PadaBreakdownRow {
  padaId: string;
  padaName: string | null;
  villageName: string | null;
  beneficiaries: PadaBeneficiary[];
}

interface VisitCounts {
  dueVisitsCount: number;
  overdueVisitsCount: number;
  dueTodayCount: number;
}

interface FollowupCounts {
  pendingCount: number;
  overdueCount: number;
}

/**
 * Aggregates the Sakhi pada list from 3 services into one response for the
 * mobile app, matching the Figma "Open"/"Referral Follow-up" rows with a
 * Women/Child split: beneficiary-service resolves which padas the Sakhi's
 * beneficiaries live in — each tagged with caseType (MOTHER/CHILD) so the
 * split can happen here without a second round-trip — then
 * visit-form-service and risk-referral-service are called in parallel with
 * the resulting beneficiary ids to get due/overdue/due-today visit counts
 * and pending/overdue follow-up counts, summed per pada per caseType. A
 * pada row with no padaId is never produced — beneficiary-service's
 * pada-breakdown already excludes beneficiaries with no padaId on record.
 *
 * open.womenCount/childCount count DISTINCT beneficiaries with >=1 due
 * visit (not raw visit rows) — same for the overdue/referral-follow-up
 * variants — matching the Figma's "how many people need attention" framing.
 * visitsRemainingCount is a raw visit count (not deduped per beneficiary)
 * of visits scheduled for today specifically, summed across both case
 * types — the narrower "due today" window, not all-time due/overdue.
 */
export function createPadasRouter(signer: Pick<TokenSigner, 'verify'>): Router {
  const router = Router();

  router.get(
    '/sakhi/:sakhiId/padas',
    authenticateGateway(signer),
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    asyncHandler(async (req, res) => {
      const { sakhiId } = req.params;
      const caller = req.user as AuthenticatedUser;
      const authorizationHeader = req.header('authorization') as string;

      // Same identity-anchor treatment as the dashboard's Sakhi lookup —
      // confirms the caller may view this Sakhi's data at all.
      await resolveSakhiAndAuthorize(sakhiId, caller, authorizationHeader);

      // Hard-fail (not degrade) if beneficiary-service is unreachable —
      // there is no meaningful padas list without knowing which padas
      // exist, unlike the visit/referral sub-calls below.
      let padaRows: PadaBreakdownRow[];
      try {
        padaRows = await fetchJson<PadaBreakdownRow[]>(
          `${BENEFICIARY_SERVICE_URL}/api/v1/beneficiaries/pada-breakdown?sakhiId=${sakhiId}`,
          caller,
          authorizationHeader,
        );
      } catch {
        throw badGateway('Unable to resolve the pada breakdown — beneficiary-service failed.');
      }

      if (padaRows.length === 0) {
        res.json(ok({ padas: [] }));
        return;
      }

      const allBeneficiaryIds = padaRows.flatMap((row) => row.beneficiaries.map((b) => b.id));

      const [visitCounts, followupCounts] = await Promise.all([
        degrade(
          'visit count-by-beneficiary',
          postJson<Record<string, VisitCounts>>(
            `${VISIT_FORM_SERVICE_URL}/api/v1/visits/count-by-beneficiary`,
            { beneficiaryIds: allBeneficiaryIds },
            caller,
            authorizationHeader,
          ),
        ),
        degrade(
          'referral pending-followups-by-beneficiary',
          postJson<Record<string, FollowupCounts>>(
            `${RISK_REFERRAL_SERVICE_URL}/api/v1/referrals/pending-followups-by-beneficiary`,
            { beneficiaryIds: allBeneficiaryIds },
            caller,
            authorizationHeader,
          ),
        ),
      ]);

      const padas = padaRows.map((row) => {
        let womenCount = 0;
        let womenOverdueCount = 0;
        let childCount = 0;
        let childOverdueCount = 0;
        let followupWomenCount = 0;
        let followupWomenOverdueCount = 0;
        let followupChildCount = 0;
        let followupChildOverdueCount = 0;
        let visitsRemainingCount = 0;

        for (const beneficiary of row.beneficiaries) {
          const visits = visitCounts?.[beneficiary.id];
          const followups = followupCounts?.[beneficiary.id];
          const isMother = beneficiary.caseType === 'MOTHER';

          if (visits) {
            if (visits.dueVisitsCount > 0) {
              if (isMother) womenCount += 1;
              else childCount += 1;
            }
            if (visits.overdueVisitsCount > 0) {
              if (isMother) womenOverdueCount += 1;
              else childOverdueCount += 1;
            }
            visitsRemainingCount += visits.dueTodayCount;
          }

          if (followups) {
            if (followups.pendingCount > 0) {
              if (isMother) followupWomenCount += 1;
              else followupChildCount += 1;
            }
            if (followups.overdueCount > 0) {
              if (isMother) followupWomenOverdueCount += 1;
              else followupChildOverdueCount += 1;
            }
          }
        }

        return {
          padaId: row.padaId,
          padaName: row.padaName,
          villageName: row.villageName,
          open: {
            womenCount,
            womenOverdueCount,
            childCount,
            childOverdueCount,
          },
          referralFollowUp: {
            womenCount: followupWomenCount,
            womenOverdueCount: followupWomenOverdueCount,
            childCount: followupChildCount,
            childOverdueCount: followupChildOverdueCount,
          },
          visitsRemainingCount,
        };
      });

      res.json(ok({ padas }));
    }),
  );

  return router;
}
