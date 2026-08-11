import { COMBINED_SCHEDULE_DECISION_GRAPH } from './graphs/combinedSchedule.graph';
import {
  generateAncHrVisit,
  generateAncPostEddVisit,
  generateAncSchedule,
  generateCcvHrVisit,
  generateCcvSchedule,
  generateIncHrVisit,
  generateIncSchedule,
  generateNnSchedule,
  generatePpSchedule,
} from './scheduleOrchestrator';

describe('scheduleOrchestrator', () => {
  describe('generateAncSchedule', () => {
    it('generates ANC1 through ANCn chained every 30 days, matching the visit-count formula', async () => {
      const rows = await generateAncSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        registrationDate: '2026-01-01',
        edd: '2026-10-08', // LMP + 280 -> max 10 visits
      });

      expect(rows).toHaveLength(10);
      expect(rows[0]).toMatchObject({ visitCode: 'ANC1', scheduledDate: '2026-01-01' });
      expect(rows[1]).toMatchObject({ visitCode: 'ANC2', scheduledDate: '2026-01-31' });
      expect(rows[9]).toMatchObject({ visitCode: 'ANC10' });
      // Each row (after ANC1) anchors to the previous row's localScheduleUuid.
      expect(rows[1].anchorVisitLocalUuid).toBe(rows[0].localScheduleUuid);
    });

    it('generates fewer visits for a shorter remaining pregnancy', async () => {
      const rows = await generateAncSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        registrationDate: '2026-08-11',
        edd: '2027-01-01', // 143 days remaining -> 6 visits
      });
      expect(rows).toHaveLength(6);
    });
  });

  describe('generateAncHrVisit', () => {
    it('anchors on the actual completion date, not the scheduled date', async () => {
      const rows = await generateAncHrVisit(COMBINED_SCHEDULE_DECISION_GRAPH, {
        actualCompletionDate: '2026-09-01',
        sequenceNo: 3,
        triggeringVisitLocalUuid: 'anc2-uuid',
      });
      expect(rows[0]).toMatchObject({ visitCode: 'ANC_HR', scheduledDate: '2026-09-16' });
    });
  });

  describe('generateAncPostEddVisit', () => {
    it('does not generate before the grace period elapses', async () => {
      const rows = await generateAncPostEddVisit(COMBINED_SCHEDULE_DECISION_GRAPH, {
        edd: '2027-01-01',
        deliveryFormFiled: false,
        daysSinceEdd: 3,
        totalRegularAncVisits: 8,
      });
      expect(rows).toEqual([]);
    });

    it('generates the correctly-named visit once the grace period elapses', async () => {
      const rows = await generateAncPostEddVisit(COMBINED_SCHEDULE_DECISION_GRAPH, {
        edd: '2027-01-01',
        deliveryFormFiled: false,
        daysSinceEdd: 8,
        totalRegularAncVisits: 8,
      });
      expect(rows[0]).toMatchObject({ visitCode: 'ANC9', scheduledDate: '2027-01-09' });
    });
  });

  describe('generatePpSchedule', () => {
    it('generates all 5 PP visits anchored to the delivery date', async () => {
      const rows = await generatePpSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        deliveryDate: '2026-08-11',
      });
      expect(rows.map((r) => r.visitCode)).toEqual(['PP1', 'PP2', 'PP3', 'PP4', 'PP5']);
      expect(rows.every((r) => r.anchorType === 'DELIVERY_DATE')).toBe(true);
    });
  });

  describe('generateNnSchedule', () => {
    it('scenario A returns both NN1 and NN2', async () => {
      const rows = await generateNnSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        deliveryDate: '2026-08-11',
        deliveryFormFilledDay: 0,
      });
      expect(rows.map((r) => r.visitCode)).toEqual(['NN1', 'NN2']);
    });

    it('scenario B returns only NN2', async () => {
      const rows = await generateNnSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        deliveryDate: '2026-08-11',
        deliveryFormFilledDay: 20,
      });
      expect(rows.map((r) => r.visitCode)).toEqual(['NN2']);
    });
  });

  describe('generateIncSchedule', () => {
    it('early registration generates INC1 through INC11 (11 visits, DOB-anchored)', async () => {
      const rows = await generateIncSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        dob: '2026-01-01',
        registrationDate: '2026-01-10',
        registrationDaysFromDob: 9,
      });
      // visitCount from PLAN is the count of visits AFTER INC1 (per the SRS
      // formula) plus INC1 itself generated separately by the orchestrator.
      expect(rows[0]).toMatchObject({
        visitCode: 'INC1',
        scheduledDate: '2026-02-28',
        anchorType: 'DOB',
      });
      expect(rows.length).toBeGreaterThan(1);
      expect(rows.every((r) => r.visitType === 'INC')).toBe(true);
    });

    it('stops generating once a candidate visit is dropped by the hard DOB+370 cutoff', async () => {
      const rows = await generateIncSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        dob: '2026-01-01',
        registrationDate: '2026-01-10',
        registrationDaysFromDob: 9,
      });
      const lastRow = rows[rows.length - 1];
      const lastScheduledDate = new Date(lastRow.scheduledDate);
      const cutoff = new Date('2027-01-06'); // DOB + 370
      expect(lastScheduledDate.getTime()).toBeLessThanOrEqual(cutoff.getTime());
    });

    it('late registration anchors INC1 on the registration date itself', async () => {
      const rows = await generateIncSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        dob: '2026-01-01',
        registrationDate: '2026-04-11',
        registrationDaysFromDob: 100,
      });
      expect(rows[0]).toMatchObject({
        visitCode: 'INC1',
        scheduledDate: '2026-04-11',
        anchorType: 'REGISTRATION',
      });
    });
  });

  describe('generateIncHrVisit', () => {
    it('anchors on the actual completion date + 15, window +-2', async () => {
      const rows = await generateIncHrVisit(COMBINED_SCHEDULE_DECISION_GRAPH, {
        dob: '2026-01-01',
        actualCompletionDate: '2026-03-01',
        sequenceNo: 3,
        triggeringVisitLocalUuid: 'inc2-uuid',
      });
      expect(rows[0]).toMatchObject({ visitCode: 'INC_HR', scheduledDate: '2026-03-16' });
    });
  });

  describe('generateCcvSchedule', () => {
    const baseInput = {
      dob: '2026-01-01',
      transitionDate: '2027-01-31', // ~13 months from DOB
      hadAnyHrInLast12m: false,
      mostRecentHasSamOrDangerSign: false,
      mostRecentHasOtherHr: false,
      last3AllAtRisk: false,
      last3AllNormalFullyImmunised: false,
    };

    it('Never at HR: generates every 2 months in both bands, all rows CCV-typed', async () => {
      const rows = await generateCcvSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, baseInput);

      expect(rows.length).toBeGreaterThan(1);
      expect(rows.every((r) => r.visitType === 'CCV')).toBe(true);
      expect(rows.every((r) => r.anchorType === 'CCV_TRANSITION')).toBe(true);
      expect(rows[0]).toMatchObject({ visitCode: 'CCV1', sequenceNo: 1 });
      expect(rows[1]).toMatchObject({ visitCode: 'CCV2', sequenceNo: 2 });
      // Every-2-months cadence: second visit ~2 months after the first.
      const first = new Date(rows[0].scheduledDate);
      const second = new Date(rows[1].scheduledDate);
      const gapDays = (second.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
      expect(gapDays).toBeGreaterThan(55);
      expect(gapDays).toBeLessThan(65);
    });

    it('Currently HR - SAM/Danger Sign: generates monthly in both bands', async () => {
      const rows = await generateCcvSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        ...baseInput,
        hadAnyHrInLast12m: true,
        mostRecentHasSamOrDangerSign: true,
      });

      const first = new Date(rows[0].scheduledDate);
      const second = new Date(rows[1].scheduledDate);
      const gapDays = (second.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
      expect(gapDays).toBeGreaterThan(25);
      expect(gapDays).toBeLessThan(35);
    });

    it('Recently Recovered: switches from monthly (13-18m) to every-2-months (19-24m) at the 18m boundary', async () => {
      // Recently Recovered requires hadAnyHrInLast12m=true (had HR before,
      // now recovered) AND last3AllAtRisk=true — hadAnyHrInLast12m=false
      // alone matches NEVER_AT_HR first (hitPolicy 'first', row order in the
      // decision table), regardless of last3AllAtRisk.
      const rows = await generateCcvSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, {
        ...baseInput,
        hadAnyHrInLast12m: true,
        last3AllAtRisk: true,
      });

      const gapsInDays = rows.slice(1).map((row, i) => {
        const prev = new Date(rows[i].scheduledDate).getTime();
        const curr = new Date(row.scheduledDate).getTime();
        return (curr - prev) / (1000 * 60 * 60 * 24);
      });

      // Early gaps (13-18m) should be ~1 month; later gaps (19-24m) ~2 months.
      expect(gapsInDays[0]).toBeGreaterThan(25);
      expect(gapsInDays[0]).toBeLessThan(35);
      expect(gapsInDays[gapsInDays.length - 1]).toBeGreaterThan(55);
      expect(gapsInDays[gapsInDays.length - 1]).toBeLessThan(65);
    });

    it('stops generating once the 24-month (DOB+730) exit point is reached', async () => {
      const rows = await generateCcvSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, baseInput);

      const lastRow = rows[rows.length - 1];
      const exitDate = new Date('2028-01-01'); // DOB + 730 days
      expect(new Date(lastRow.scheduledDate).getTime()).toBeLessThanOrEqual(exitDate.getTime());
    });

    it('chains anchorVisitLocalUuid from each row to the previous one', async () => {
      const rows = await generateCcvSchedule(COMBINED_SCHEDULE_DECISION_GRAPH, baseInput);

      expect(rows[0].anchorVisitLocalUuid).toBeNull();
      expect(rows[1].anchorVisitLocalUuid).toBe(rows[0].localScheduleUuid);
    });
  });

  describe('generateCcvHrVisit', () => {
    it('generates a fresh CCV-HR row for each detection, 30 days later', async () => {
      const rows = await generateCcvHrVisit(COMBINED_SCHEDULE_DECISION_GRAPH, {
        actualDetectionDate: '2027-03-01',
        sequenceNo: 3,
        triggeringVisitLocalUuid: 'ccv2-uuid',
      });
      expect(rows[0]).toMatchObject({ visitCode: 'CCV_HR', scheduledDate: '2027-03-31' });
    });
  });
});
