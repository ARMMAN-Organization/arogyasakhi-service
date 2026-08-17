import { Router } from 'express';
import {
  asyncHandler,
  badGateway,
  badRequest,
  forbidden,
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

interface BeneficiaryWithRisk {
  id: string;
  beneficiaryName: string;
  phoneNumber: string | null;
  riskLevel: 'none' | 'mild' | 'moderate' | 'high';
}

interface OpenVisitCard {
  visitId: string;
  beneficiaryId: string;
  visitType: string;
  dueDate: string;
}

interface FollowupCard {
  followupId: string;
  beneficiaryId: string;
  followupDate: string;
}

/** Maps beneficiary-service's MOTHER/CHILD vocabulary to the FE card's
 * mother/infant vocabulary — a display concern local to this route, not a
 * change to beneficiary-service's own CaseType. */
function toCardCaseType(caseType: 'MOTHER' | 'CHILD'): 'mother' | 'infant' {
  return caseType === 'MOTHER' ? 'mother' : 'infant';
}

/**
 * Aggregates the pada visit-list screen's two tabs into one response.
 * "open" cards come from visit-form-service (due/overdue VisitInstance
 * rows on `date`); "referral_follow_up" cards come from
 * risk-referral-service (PENDING ReferralFollowup rows, unfiltered by
 * date). Both openCount/referralFollowUpCount are always returned
 * regardless of the requested `status`, so both tab labels can be shown
 * from one call. Auth is pada-scoped, not Sakhi-scoped: a caller may view
 * a pada's visits only if they have >=1 beneficiary there (checked via
 * their own pada-breakdown output, since there is no direct
 * Sakhi-owns-pada concept) — a Sakhi/Supervisor with no beneficiaries in
 * that pada gets 403; MANAGER/ADMIN are unrestricted.
 *
 * If beneficiary-service's name/phone/riskLevel lookup fails AFTER the
 * visit/referral rows are already fetched, those fields degrade to null
 * per card rather than failing the whole response — the Sakhi still sees
 * who's due and when, just without contact/risk info until retried. Note:
 * name/phone/riskLevel all come from ONE beneficiary-service call and
 * degrade TOGETHER as a unit (there's no per-field partial failure in that
 * call's implementation) — never treat them as independently nullable.
 *
 * caseType (mother/infant) comes from beneficiary-service's pada-breakdown
 * (already fetched for auth/scoping above), not from the visit/referral
 * lookups — it's never null unless a card's beneficiaryId is somehow
 * missing from the pada's own beneficiary list, which shouldn't happen
 * since the beneficiaryIds used for the visit/referral queries are drawn
 * from that same list.
 */
export function createPadaVisitsRouter(signer: Pick<TokenSigner, 'verify'>): Router {
  const router = Router();

  router.get(
    '/padas/:padaId/visits',
    authenticateGateway(signer),
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    asyncHandler(async (req, res) => {
      const { padaId } = req.params;
      const caller = req.user as AuthenticatedUser;
      const authorizationHeader = req.header('authorization') as string;
      const status = req.query.status as string | undefined;
      const date = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
      const search = req.query.search as string | undefined;

      if (status !== 'open' && status !== 'referral_follow_up') {
        throw badRequest("status must be 'open' or 'referral_follow_up'.");
      }

      // Identity anchor: resolve the caller's own pada-breakdown (their
      // scope, unrestricted for MANAGER/ADMIN) and find the row for this
      // padaId — hard-fail (not degrade) if beneficiary-service is
      // unreachable, same as the padas-list endpoint.
      let padaRows: PadaBreakdownRow[];
      try {
        padaRows = await fetchJson<PadaBreakdownRow[]>(
          `${BENEFICIARY_SERVICE_URL}/api/v1/beneficiaries/pada-breakdown`,
          caller,
          authorizationHeader,
        );
      } catch {
        throw badGateway('Unable to resolve the pada breakdown — beneficiary-service failed.');
      }

      const pada = padaRows.find((row) => row.padaId === padaId);
      if (!pada) {
        throw forbidden('You do not have access to this pada.');
      }

      const beneficiaryIds = pada.beneficiaries.map((b) => b.id);
      const caseTypeById = new Map(pada.beneficiaries.map((b) => [b.id, b.caseType]));

      // Both tabs' rows are fetched every time regardless of `status` — the
      // response always reports both openCount/referralFollowUpCount so
      // the FE can show both tab labels from one call.
      const [openCards, followupCards] = await Promise.all([
        postJson<OpenVisitCard[]>(
          `${VISIT_FORM_SERVICE_URL}/api/v1/visits/by-pada`,
          { beneficiaryIds, date },
          caller,
          authorizationHeader,
        ),
        postJson<FollowupCard[]>(
          `${RISK_REFERRAL_SERVICE_URL}/api/v1/referrals/followups-by-beneficiary`,
          { beneficiaryIds },
          caller,
          authorizationHeader,
        ),
      ]);

      const openCount = openCards.length;
      const referralFollowUpCount = followupCards.length;
      const activeBeneficiaryIds =
        status === 'open'
          ? openCards.map((c) => c.beneficiaryId)
          : followupCards.map((c) => c.beneficiaryId);

      const beneficiariesWithRisk = await degrade(
        'beneficiary by-ids-with-risk',
        fetchJson<BeneficiaryWithRisk[]>(
          `${BENEFICIARY_SERVICE_URL}/api/v1/beneficiaries/by-ids-with-risk?ids=${activeBeneficiaryIds.join(',')}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
          caller,
          authorizationHeader,
        ),
      );
      const beneficiaryById = new Map((beneficiariesWithRisk ?? []).map((b) => [b.id, b]));

      // When a search is applied, only cards for matching beneficiaries
      // survive — beneficiaryById already reflects the search-narrowed set.
      const matchesSearch = (beneficiaryId: string) =>
        !search || beneficiaryById.has(beneficiaryId);

      const visits =
        status === 'open'
          ? openCards
              .filter((card) => matchesSearch(card.beneficiaryId))
              .map((card) => {
                const beneficiary = beneficiaryById.get(card.beneficiaryId);
                const caseType = caseTypeById.get(card.beneficiaryId);
                return {
                  visitId: card.visitId,
                  beneficiaryId: card.beneficiaryId,
                  beneficiaryName: beneficiary?.beneficiaryName ?? null,
                  caseType: caseType ? toCardCaseType(caseType) : null,
                  riskLevel: beneficiary?.riskLevel ?? null,
                  padaName: pada.padaName,
                  villageName: pada.villageName,
                  scheduledDate: card.dueDate,
                  visitType: card.visitType,
                  dueDate: card.dueDate,
                  phoneNumber: beneficiary?.phoneNumber ?? null,
                };
              })
          : followupCards
              .filter((card) => matchesSearch(card.beneficiaryId))
              .map((card) => {
                const beneficiary = beneficiaryById.get(card.beneficiaryId);
                const caseType = caseTypeById.get(card.beneficiaryId);
                return {
                  visitId: null,
                  beneficiaryId: card.beneficiaryId,
                  beneficiaryName: beneficiary?.beneficiaryName ?? null,
                  caseType: caseType ? toCardCaseType(caseType) : null,
                  riskLevel: beneficiary?.riskLevel ?? null,
                  padaName: pada.padaName,
                  villageName: pada.villageName,
                  scheduledDate: card.followupDate,
                  visitType: 'Referral Follow-up',
                  dueDate: card.followupDate,
                  phoneNumber: beneficiary?.phoneNumber ?? null,
                };
              });

      res.json(ok({ openCount, referralFollowUpCount, visits }));
    }),
  );

  return router;
}
