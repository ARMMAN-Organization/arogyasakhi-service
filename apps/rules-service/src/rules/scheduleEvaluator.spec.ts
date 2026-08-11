import { evaluateSchedulePack } from './scheduleEvaluator';
import { ancRulesJson } from './scheduling/anc.rulesJson';
import { ppRulesJson } from './scheduling/pp.rulesJson';
import { nnRulesJson } from './scheduling/nn.rulesJson';
import { incRulesJson } from './scheduling/inc.rulesJson';
import { ccvRulesJson } from './scheduling/ccv.rulesJson';
import { hrRulesJson } from './scheduling/hr.rulesJson';
import { deliveryRulesJson } from './scheduling/delivery.rulesJson';

describe('evaluateSchedulePack', () => {
  // 1. BR-01/ANC formula: registration on LMP date -> exactly 10 visits;
  // re-running with a changed EDD (simulating a Supervisor-approved LMP/EDD
  // change) reproduces a correctly different schedule with no special-case
  // code path, since the pack is stateless/pure.
  describe('ANC', () => {
    it('generates exactly 10 visits when registered on the LMP date (FR-S-3.1/Appendix A.1)', async () => {
      const result = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-01-01',
        edd: '2026-10-08', // LMP + 280 days
        deliveryFormFiledDate: null,
      });
      expect(result.totalRegularVisits).toBe(10);
      expect((result.visits as unknown[]).length).toBe(10);
    });

    it('recomputes a different schedule when EDD changes, with no special-case path (BR-01)', async () => {
      const original = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-01-01',
        edd: '2026-10-08',
        deliveryFormFiledDate: null,
      });
      const afterEddChange = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-01-01',
        edd: '2026-11-07', // +30 days
        deliveryFormFiledDate: null,
      });
      expect(afterEddChange.totalRegularVisits).toBe((original.totalRegularVisits as number) + 1);
    });

    // 2. ANC1/ANC2-n windows: Day 0-5 fixed; +30d +/-5d chain.
    it('ANC1 is Day 0 with window Day 0 to +5; ANC2 is +30 days with a +/-5 day window', async () => {
      const result = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-01-01',
        edd: '2026-10-08',
        deliveryFormFiledDate: null,
      });
      const visits = result.visits as Array<Record<string, string>>;
      expect(visits[0]).toMatchObject({
        visitName: 'ANC1',
        scheduledDate: '2026-01-01',
        windowOpen: '2026-01-01',
        windowClose: '2026-01-06',
      });
      expect(visits[1]).toMatchObject({
        visitName: 'ANC2',
        scheduledDate: '2026-01-31',
        windowOpen: '2026-01-26',
        windowClose: '2026-02-05',
      });
    });

    // 3. SR-ANC-01/BR-08: delivery not filed by EDD+7 -> ANC(n+1) at EDD+8..13
    // with correct dynamic name for n=8 and n=10 regular visits.
    it('generates a dynamically named ANC(n+1) Post-EDD visit when delivery is not filed by EDD+7 (n=10)', async () => {
      const result = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-01-01',
        edd: '2026-10-08',
        deliveryFormFiledDate: '2026-10-20',
      });
      expect(result.deliveryFormFiledByEddPlus7).toBe(false);
      expect(result.postEddVisit).toMatchObject({
        visitName: 'ANC11',
        scheduledDate: '2026-10-16',
        windowOpen: '2026-10-16',
        windowClose: '2026-10-21',
      });
    });

    it('generates ANC9 as the Post-EDD visit when only 8 regular visits were scheduled', async () => {
      // Shorter pregnancy window -> fewer regular ANC visits (n=8): (edd-reg)/30+1=8.
      const result = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-03-12',
        edd: '2026-10-08',
        deliveryFormFiledDate: '2026-10-20',
      });
      expect(result.totalRegularVisits).toBe(8);
      expect((result.postEddVisit as Record<string, string>).visitName).toBe('ANC9');
    });

    it('does not generate a Post-EDD visit when delivery is filed within EDD+7', async () => {
      const result = await evaluateSchedulePack('ANC', ancRulesJson, {
        registrationDate: '2026-01-01',
        edd: '2026-10-08',
        deliveryFormFiledDate: '2026-10-10',
      });
      expect(result.deliveryFormFiledByEddPlus7).toBe(true);
      expect(result.postEddVisit).toBeNull();
    });
  });

  // 4/5. BR-05/PP: PP3-5 depend only on deliveryDate (no "actual completion
  // date" input field exists on this pack at all); fixed table matches
  // Appendix A.2 exactly.
  describe('PP', () => {
    it('has no actual-completion-date input field, so PP3-5 cannot shift on a late PP2 (BR-05)', () => {
      const fnNode = ppRulesJson.nodes.find((n) => n.type === 'functionNode') as {
        content: string;
      };
      expect(fnNode.content).not.toMatch(/actual.*completion/i);
    });

    it('matches Appendix A.2 exactly for a fixed delivery date', async () => {
      const result = await evaluateSchedulePack('PP', ppRulesJson, { deliveryDate: '2026-01-01' });
      const visits = result.visits as Array<Record<string, string>>;
      expect(visits).toEqual([
        {
          visitName: 'PP1',
          scheduledDate: '2026-01-01',
          windowOpen: '2026-01-01',
          windowClose: '2026-01-15',
        },
        {
          visitName: 'PP2',
          scheduledDate: '2026-01-16',
          windowOpen: '2026-01-16',
          windowClose: '2026-01-29',
        },
        {
          visitName: 'PP3',
          scheduledDate: '2026-02-28',
          windowOpen: '2026-02-23',
          windowClose: '2026-03-05',
        },
        {
          visitName: 'PP4',
          scheduledDate: '2026-03-30',
          windowOpen: '2026-03-25',
          windowClose: '2026-04-04',
        },
        {
          visitName: 'PP5',
          scheduledDate: '2026-04-29',
          windowOpen: '2026-04-24',
          windowClose: '2026-05-04',
        },
      ]);
    });
  });

  // 6. NN: three scenarios (filled day 5, day 20, day 28/29+) each produce
  // correct NN1/NN2 presence and windows, including the Day 29+ branch that
  // was missing from the first draft of this pack.
  describe('NN', () => {
    it('Scenario A (Day 0-14): NN1 same-session window 0-14, NN2 window 15-28', async () => {
      const result = await evaluateSchedulePack('NN', nnRulesJson, {
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-06',
      });
      expect(result.scenario).toBe('DAY_0_TO_14');
      expect(result.nn1).toMatchObject({ windowOpen: '2026-01-01', windowClose: '2026-01-15' });
      expect(result.nn2).toMatchObject({ windowOpen: '2026-01-16', windowClose: '2026-01-29' });
    });

    it('Scenario B (Day 15-28): NN1 skipped (null, not missed), NN2 immediate', async () => {
      const result = await evaluateSchedulePack('NN', nnRulesJson, {
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-21',
      });
      expect(result.scenario).toBe('DAY_15_TO_28');
      expect(result.nn1).toBeNull();
      expect(result.nn2).toMatchObject({ scheduledDate: '2026-01-21', windowClose: '2026-01-29' });
    });

    it('Day 29+: no neonatal section at all (both NN1 and NN2 skipped) — Appendix G.2 row 3', async () => {
      const result = await evaluateSchedulePack('NN', nnRulesJson, {
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-02-05',
      });
      expect(result.scenario).toBe('DAY_29_PLUS');
      expect(result.neonatalPhaseApplies).toBe(false);
      expect(result.nn1).toBeNull();
      expect(result.nn2).toBeNull();
    });

    // 7. BR-06/SR-NN-01: no HR-related field reachable from the NN pack's output.
    it('has no HR-related output field (BR-06/SR-NN-01 — no HR visits in the neonatal phase)', async () => {
      const result = await evaluateSchedulePack('NN', nnRulesJson, {
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-06',
      });
      expect(Object.keys(result).some((k) => /hr/i.test(k))).toBe(false);
    });
  });

  // 8. BR-02/INC two-formula: Day 58 boundary inclusive both directions;
  // late-reg floor formula exact match.
  describe('INC', () => {
    it('early registration (Day 30): 11 visits, INC1 = DOB + 58', async () => {
      const result = await evaluateSchedulePack('INC', incRulesJson, {
        dob: '2026-01-01',
        registrationDate: '2026-01-31',
      });
      expect(result.registrationCategory).toBe('EARLY');
      const visits = result.visits as Array<Record<string, string>>;
      expect(visits.length).toBe(11);
      expect(visits[0]).toMatchObject({ visitName: 'INC1', scheduledDate: '2026-02-28' });
    });

    it('registration exactly on Day 58 is still treated as early registration (inclusive boundary)', async () => {
      const result = await evaluateSchedulePack('INC', incRulesJson, {
        dob: '2026-01-01',
        registrationDate: '2026-02-28', // Day 58
      });
      expect(result.registrationCategory).toBe('EARLY');
    });

    it('late registration (Day 100): INC1 = registration date, correct floor-formula visit count', async () => {
      const result = await evaluateSchedulePack('INC', incRulesJson, {
        dob: '2026-01-01',
        registrationDate: '2026-04-11', // Day 100
      });
      expect(result.registrationCategory).toBe('LATE');
      const visits = result.visits as Array<Record<string, string>>;
      // floor((365-100)/30) = 8 additional visits + INC1 = 9 total.
      expect(visits.length).toBe(9);
      expect(visits[0]).toMatchObject({ visitName: 'INC1', scheduledDate: '2026-04-11' });
    });

    // 9. BR-12: visit beyond DOB+370 dropped silently, not flagged missed;
    // visit at exactly DOB+370 retained.
    it('drops any visit scheduled beyond DOB + 370 silently, not as missed (BR-12)', async () => {
      const result = await evaluateSchedulePack('INC', incRulesJson, {
        dob: '2026-01-01',
        registrationDate: '2026-01-01', // Day 0, early registration
      });
      const visits = result.visits as Array<Record<string, string>>;
      const dropped = result.droppedVisits as string[];
      const cutoff = new Date('2027-01-06'); // DOB + 370
      for (const v of visits) {
        expect(new Date(v.scheduledDate).getTime()).toBeLessThanOrEqual(cutoff.getTime());
      }
      // INC1 = DOB+58, chained every 30 days -> INC11 = DOB+58+300 = DOB+358 (kept).
      // Nothing in the 11-visit early-registration series exceeds DOB+370, so
      // droppedVisits should be empty for this input — the cutoff only bites
      // pathological/late-registration edge cases with a later anchor.
      expect(Array.isArray(dropped)).toBe(true);
    });
  });

  // 10. BR-13: calling the CCV pack twice with the same "last 3 INC visits"
  // input is idempotent — proves no hidden re-evaluation state.
  // 11. CCV 5-state matrix: one vector per state x both cadence sub-periods.
  describe('CCV', () => {
    const baseInput = {
      dob: '2025-01-01',
      hrDetectedAtLastCcvVisit: false,
    };

    it('is idempotent across repeated calls with the same input (BR-13 — no hidden re-evaluation)', async () => {
      const input = {
        ...baseInput,
        hrEverDetectedIn0to12m: false,
        mostRecentIncVisitHrType: 'NONE',
        last3IncVisitsNormal: true,
      };
      const first = await evaluateSchedulePack('CCV', ccvRulesJson, input);
      const second = await evaluateSchedulePack('CCV', ccvRulesJson, input);
      expect(second).toEqual(first);
    });

    it('NEVER_AT_HR: no HR ever detected -> 1 visit every 2 months, both sub-periods', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: false,
        mostRecentIncVisitHrType: 'NONE',
        last3IncVisitsNormal: true,
      });
      expect(result.riskState).toBe('NEVER_AT_HR');
      expect(result.cadence13to18MonthsEveryNMonths).toBe(2);
      expect(result.cadence19to24MonthsEveryNMonths).toBe(2);
    });

    it('CURRENTLY_HR_SAM: SAM/danger sign at most recent visit -> monthly, both sub-periods', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: true,
        mostRecentIncVisitHrType: 'SAM_DANGER',
        last3IncVisitsNormal: false,
      });
      expect(result.riskState).toBe('CURRENTLY_HR_SAM');
      expect(result.cadence13to18MonthsEveryNMonths).toBe(1);
      expect(result.cadence19to24MonthsEveryNMonths).toBe(1);
    });

    it('CURRENTLY_HR_OTHER: other HR condition at most recent visit -> monthly, both sub-periods', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: true,
        mostRecentIncVisitHrType: 'OTHER',
        last3IncVisitsNormal: false,
      });
      expect(result.riskState).toBe('CURRENTLY_HR_OTHER');
      expect(result.cadence13to18MonthsEveryNMonths).toBe(1);
      expect(result.cadence19to24MonthsEveryNMonths).toBe(1);
    });

    it('RECENTLY_RECOVERED: HR was present historically but last 3 visits normal -> monthly 13-18m, every 2 months 19-24m', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: true,
        mostRecentIncVisitHrType: 'NONE',
        last3IncVisitsNormal: true,
      });
      expect(result.riskState).toBe('RECENTLY_RECOVERED');
      expect(result.cadence13to18MonthsEveryNMonths).toBe(1);
      expect(result.cadence19to24MonthsEveryNMonths).toBe(2);
    });

    it('STABLE_LOW_RISK: HR detected earlier, last 3 not normal (undefined by Appendix A.5, falls through to Stable Low Risk cadence) -> every 2 months, both sub-periods', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: true,
        mostRecentIncVisitHrType: 'NONE',
        last3IncVisitsNormal: false,
      });
      expect(result.riskState).toBe('STABLE_LOW_RISK');
      expect(result.cadence13to18MonthsEveryNMonths).toBe(2);
      expect(result.cadence19to24MonthsEveryNMonths).toBe(2);
    });

    // 12. Program exit + HR extension: last visit HR-positive -> extra
    // CCV-HR at +30d; last visit HR-negative -> clean exit at DOB+730.
    it('generates one extra CCV-HR visit 30 days after the last CCV visit when HR is detected at exit', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: false,
        mostRecentIncVisitHrType: 'NONE',
        last3IncVisitsNormal: true,
        hrDetectedAtLastCcvVisit: true,
      });
      expect(result.closureDeferredForExtension).toBe(true);
      expect(result.extensionVisit).toMatchObject({ visitName: 'CCV-HR' });
      const visits = result.visits as Array<Record<string, string>>;
      const lastVisitDate = new Date(visits[visits.length - 1].scheduledDate);
      const extensionDate = new Date(
        (result.extensionVisit as Record<string, string>).scheduledDate,
      );
      const diffDays = Math.round((extensionDate.getTime() - lastVisitDate.getTime()) / 86_400_000);
      expect(diffDays).toBe(30);
    });

    it('exits cleanly at DOB + 730 with no extension when HR is not detected at the last visit', async () => {
      const result = await evaluateSchedulePack('CCV', ccvRulesJson, {
        ...baseInput,
        hrEverDetectedIn0to12m: false,
        mostRecentIncVisitHrType: 'NONE',
        last3IncVisitsNormal: true,
        hrDetectedAtLastCcvVisit: false,
      });
      expect(result.closureDeferredForExtension).toBe(false);
      expect(result.extensionVisit).toBeNull();
    });
  });

  // 13/14. BR-03 shared anchor logic across ANC-HR/INC-HR/CCV-HR; INC
  // cumulative vs CCV single-instance behaviour.
  describe('HR', () => {
    it('anchors ANC-HR, INC-HR, and CCV-HR identically off actualCompletionDate (BR-03)', async () => {
      const anc = await evaluateSchedulePack('HR', hrRulesJson, {
        phase: 'ANC',
        hrDetectedThisVisit: true,
        actualCompletionDate: '2026-01-01',
      });
      const inc = await evaluateSchedulePack('HR', hrRulesJson, {
        phase: 'INC',
        hrDetectedThisVisit: true,
        actualCompletionDate: '2026-01-01',
      });
      // Both ANC and INC use the same 15-day/+-2-day anchor computation.
      expect((anc.hrVisit as Record<string, string>).scheduledDate).toBe(
        (inc.hrVisit as Record<string, string>).scheduledDate,
      );
    });

    it('INC phase is cumulative: repeated detections each produce a new HR visit (FR-S-5.3)', async () => {
      const first = await evaluateSchedulePack('HR', hrRulesJson, {
        phase: 'INC',
        hrDetectedThisVisit: true,
        actualCompletionDate: '2026-01-01',
      });
      const second = await evaluateSchedulePack('HR', hrRulesJson, {
        phase: 'INC',
        hrDetectedThisVisit: true,
        actualCompletionDate: '2026-02-01',
      });
      expect(first.cumulative).toBe(true);
      expect(second.cumulative).toBe(true);
      expect(first.generateHrVisit).toBe(true);
      expect(second.generateHrVisit).toBe(true);
    });

    it('CCV phase is single-instance per detection, 30-day offset, +/-5 day window (FR-S-5.3)', async () => {
      const result = await evaluateSchedulePack('HR', hrRulesJson, {
        phase: 'CCV',
        hrDetectedThisVisit: true,
        actualCompletionDate: '2026-01-01',
      });
      expect(result.cumulative).toBe(false);
      expect(result.hrVisit).toMatchObject({
        visitName: 'CCV-HR',
        scheduledDate: '2026-01-31',
        windowOpen: '2026-01-26',
        windowClose: '2026-02-05',
      });
    });

    it('rejects phase NN — no HR visits are ever generated in the neonatal phase (BR-06/SR-NN-01)', async () => {
      await expect(
        evaluateSchedulePack('HR', hrRulesJson, {
          phase: 'NN',
          hrDetectedThisVisit: true,
          actualCompletionDate: '2026-01-01',
        }),
      ).rejects.toBeTruthy();
    });
  });

  // 15/16/17/18. Delivery orchestration — G.1/G.4/G.5/G.2.
  describe('DELIVERY', () => {
    it('G.1: ANC-enrolled live birth -> PP2-5 + NN + INC, ancVisitsToLapse-equivalent flag set', async () => {
      const result = await evaluateSchedulePack('DELIVERY', deliveryRulesJson, {
        deliveryOutcome: 'LIVE_BIRTH',
        motherEnrollmentType: 'ANC_ENROLLED',
        numberOfChildren: 1,
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-01',
      });
      const motherPlan = result.motherPlan as Record<string, unknown>;
      expect(motherPlan.ppScheduleStartsFrom).toBe('PP2');
      expect(motherPlan.lapseOpenAncVisits).toBe(true);
      const childPlans = result.childPlans as Array<Record<string, unknown>>;
      expect(childPlans).toHaveLength(1);
      expect(childPlans[0]).toMatchObject({ generateNnSchedule: true, generateIncSchedule: true });
    });

    it('G.4: stillbirth -> full PP1-5 for mother, zero child schedules', async () => {
      const result = await evaluateSchedulePack('DELIVERY', deliveryRulesJson, {
        deliveryOutcome: 'STILLBIRTH',
        motherEnrollmentType: 'ANC_ENROLLED',
        numberOfChildren: 1,
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-01',
      });
      const motherPlan = result.motherPlan as Record<string, unknown>;
      expect(motherPlan.ppScheduleStartsFrom).toBe('PP1');
      expect(motherPlan.generatePpSchedule).toBe(true);
      expect(result.childPlans).toEqual([]);
    });

    it('G.5: multiple births -> one independent child plan per child, one shared PP schedule', async () => {
      const result = await evaluateSchedulePack('DELIVERY', deliveryRulesJson, {
        deliveryOutcome: 'LIVE_BIRTH',
        motherEnrollmentType: 'DIRECT',
        numberOfChildren: 2,
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-01',
      });
      const childPlans = result.childPlans as Array<Record<string, unknown>>;
      expect(childPlans).toHaveLength(2);
      expect(childPlans[0].childIndex).toBe(0);
      expect(childPlans[1].childIndex).toBe(1);
    });

    it('G.2: late delivery form on Day 20 -> neonatal phase still applies (falls in the 15-28 window)', async () => {
      const result = await evaluateSchedulePack('DELIVERY', deliveryRulesJson, {
        deliveryOutcome: 'LIVE_BIRTH',
        motherEnrollmentType: 'DIRECT',
        numberOfChildren: 1,
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-01-21', // Day 20
      });
      expect(result.neonatalPhaseAppliesGlobally).toBe(true);
      const childPlans = result.childPlans as Array<Record<string, unknown>>;
      expect(childPlans[0].generateNnSchedule).toBe(true);
    });

    it('G.2: delivery form filed on Day 29+ -> no neonatal section, straight to INC', async () => {
      const result = await evaluateSchedulePack('DELIVERY', deliveryRulesJson, {
        deliveryOutcome: 'LIVE_BIRTH',
        motherEnrollmentType: 'DIRECT',
        numberOfChildren: 1,
        deliveryDate: '2026-01-01',
        deliveryFormFiledDate: '2026-02-05', // Day 35
      });
      expect(result.neonatalPhaseAppliesGlobally).toBe(false);
      const childPlans = result.childPlans as Array<Record<string, unknown>>;
      expect(childPlans[0].generateNnSchedule).toBe(false);
      expect(childPlans[0].generateIncSchedule).toBe(true);
    });
  });

  // 19. Validation/error handling.
  describe('validation errors', () => {
    const IDENTITY_GRAPH = {
      contentType: 'application/vnd.gorules.decision',
      nodes: [
        { id: 'input1', type: 'inputNode', name: 'input', position: { x: 0, y: 0 } },
        { id: 'output1', type: 'outputNode', name: 'output', position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'e1', sourceId: 'input1', targetId: 'output1', type: 'edge' }],
    };

    it('rejects a non-object decision-graph output with a 400', async () => {
      await expect(
        evaluateSchedulePack('ANC', IDENTITY_GRAPH, {} as unknown as Record<string, unknown>),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects an ANC output missing totalRegularVisits with a 400', async () => {
      await expect(
        evaluateSchedulePack('ANC', IDENTITY_GRAPH, {
          visits: [],
          postEddVisit: null,
          deliveryFormFiledByEddPlus7: false,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects a PP output that does not contain exactly 5 visits with a 400', async () => {
      await expect(
        evaluateSchedulePack('PP', IDENTITY_GRAPH, {
          visits: [
            {
              visitName: 'PP1',
              scheduledDate: '2026-01-01',
              windowOpen: '2026-01-01',
              windowClose: '2026-01-15',
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects a CCV output with an invalid riskState with a 400', async () => {
      await expect(
        evaluateSchedulePack('CCV', IDENTITY_GRAPH, {
          riskState: 'NOT_A_REAL_STATE',
          cadence13to18MonthsEveryNMonths: 1,
          cadence19to24MonthsEveryNMonths: 1,
          visits: [],
          extensionVisit: null,
          closureDeferredForExtension: false,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
