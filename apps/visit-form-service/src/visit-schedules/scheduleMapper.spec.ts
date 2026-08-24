import { toBulkScheduleRows } from './scheduleMapper';

describe('toBulkScheduleRows', () => {
  const beneficiaryId = '11111111-1111-1111-1111-111111111111';

  it('maps ANC visits with correct visitCode/sequenceNo and remapped date fields', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'ANC', {
      totalRegularVisits: 2,
      visits: [
        {
          visitName: 'ANC1',
          scheduledDate: '2026-08-04',
          windowOpen: '2026-08-04',
          windowClose: '2026-08-09',
        },
        {
          visitName: 'ANC2',
          scheduledDate: '2026-09-03',
          windowOpen: '2026-08-29',
          windowClose: '2026-09-08',
        },
      ],
      postEddVisit: null,
      deliveryFormFiledByEddPlus7: false,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      visitCode: 'ANC1',
      visitType: 'ANC',
      sequenceNo: 1,
      scheduledDate: '2026-08-04',
      windowStartDate: '2026-08-04',
      windowEndDate: '2026-08-09',
      anchorType: 'REGISTRATION',
      anchorVisitLocalUuid: null,
    });
    expect(rows[0].localScheduleUuid).toBe(`generated-${beneficiaryId}-ANC1`);
  });

  it('appends a distinct ANC_POST_EDD row when postEddVisit is present', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'ANC', {
      totalRegularVisits: 1,
      visits: [
        {
          visitName: 'ANC1',
          scheduledDate: '2026-08-04',
          windowOpen: '2026-08-04',
          windowClose: '2026-08-09',
        },
      ],
      postEddVisit: {
        visitName: 'ANC_POST_EDD',
        scheduledDate: '2027-03-09',
        windowOpen: '2027-03-08',
        windowClose: '2027-03-10',
      },
      deliveryFormFiledByEddPlus7: false,
    });

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      visitCode: 'ANC_POST_EDD1',
      visitType: 'ANC_POST_EDD',
      anchorType: 'EDD',
    });
  });

  it('rejects an ANC evaluation with a malformed visits array', () => {
    expect(() => toBulkScheduleRows(beneficiaryId, 'ANC', { visits: 'not-an-array' })).toThrow(
      /visits array/,
    );
  });

  it('requires exactly 5 PP visits', () => {
    const oneVisit = [
      {
        visitName: 'PP1',
        scheduledDate: '2026-08-04',
        windowOpen: '2026-08-01',
        windowClose: '2026-08-09',
      },
    ];
    expect(() => toBulkScheduleRows(beneficiaryId, 'PP', { visits: oneVisit })).toThrow(
      /exactly 5/,
    );
  });

  it('maps 5 PP visits anchored to DELIVERY_DATE', () => {
    const visits = Array.from({ length: 5 }, (_, i) => ({
      visitName: `PP${i + 1}`,
      scheduledDate: '2026-08-04',
      windowOpen: '2026-08-01',
      windowClose: '2026-08-09',
    }));
    const rows = toBulkScheduleRows(beneficiaryId, 'PP', { visits });
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.anchorType === 'DELIVERY_DATE')).toBe(true);
    expect(rows.map((r) => r.visitCode)).toEqual(['PP1', 'PP2', 'PP3', 'PP4', 'PP5']);
  });

  it('maps only the present NN slot(s), skipping an absent nn2', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'NN', {
      scenario: 'SINGLE_VISIT',
      neonatalPhaseApplies: true,
      nn1: {
        visitName: 'NN1',
        scheduledDate: '2026-08-04',
        windowOpen: '2026-08-01',
        windowClose: '2026-08-09',
      },
      nn2: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ visitCode: 'NN1', sequenceNo: 1, anchorType: 'DOB' });
  });

  it('maps both NN slots when both are present, with sequenceNo 1 and 2', () => {
    const window = {
      scheduledDate: '2026-08-04',
      windowOpen: '2026-08-01',
      windowClose: '2026-08-09',
    };
    const rows = toBulkScheduleRows(beneficiaryId, 'NN', {
      scenario: 'DOUBLE_VISIT',
      neonatalPhaseApplies: true,
      nn1: { visitName: 'NN1', ...window },
      nn2: { visitName: 'NN2', ...window },
    });
    expect(rows.map((r) => r.sequenceNo)).toEqual([1, 2]);
  });

  it('maps INC visits and ignores droppedVisits', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'INC', {
      registrationCategory: 'EARLY',
      visits: [
        {
          visitName: 'INC1',
          scheduledDate: '2026-09-04',
          windowOpen: '2026-09-01',
          windowClose: '2026-09-09',
        },
      ],
      droppedVisits: ['INC0'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ visitCode: 'INC1', anchorType: 'DOB' });
  });

  it('maps a single HR row when generateHrVisit is true', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'HR', {
      generateHrVisit: true,
      cumulative: false,
      hrVisit: {
        visitName: 'ANC_HR',
        scheduledDate: '2026-08-10',
        windowOpen: '2026-08-08',
        windowClose: '2026-08-12',
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      visitCode: 'ANC_HR1',
      visitType: 'ANC_HR',
      anchorType: 'ACTUAL_VISIT',
    });
  });

  it('maps no rows when generateHrVisit is false', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'HR', {
      generateHrVisit: false,
      cumulative: false,
      hrVisit: null,
    });
    expect(rows).toEqual([]);
  });

  it('rejects an HR evaluation claiming generateHrVisit=true with no hrVisit', () => {
    expect(() =>
      toBulkScheduleRows(beneficiaryId, 'HR', {
        generateHrVisit: true,
        cumulative: false,
        hrVisit: null,
      }),
    ).toThrow(/hrVisit/);
  });

  it('returns no rows for DELIVERY — it is a dispatch decision, not visit windows', () => {
    const rows = toBulkScheduleRows(beneficiaryId, 'DELIVERY', {
      motherPlan: {
        generatePpSchedule: true,
        ppScheduleStartsFrom: 'PP1',
        lapseOpenAncVisits: true,
      },
      childPlans: [{ childIndex: 0, generateNnSchedule: true, generateIncSchedule: true }],
      neonatalPhaseAppliesGlobally: true,
    });
    expect(rows).toEqual([]);
  });

  it('deterministic localScheduleUuid: calling twice with the same input produces identical uuids', () => {
    const input = {
      visits: [
        {
          visitName: 'ANC1',
          scheduledDate: '2026-08-04',
          windowOpen: '2026-08-04',
          windowClose: '2026-08-09',
        },
      ],
      totalRegularVisits: 1,
      postEddVisit: null,
      deliveryFormFiledByEddPlus7: false,
    };
    const first = toBulkScheduleRows(beneficiaryId, 'ANC', input);
    const second = toBulkScheduleRows(beneficiaryId, 'ANC', input);
    expect(first[0].localScheduleUuid).toBe(second[0].localScheduleUuid);
  });
});
