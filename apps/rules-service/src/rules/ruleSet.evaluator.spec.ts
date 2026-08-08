import { evaluateRulePack } from './ruleSet.evaluator';

/**
 * A minimal gorules decision graph whose output node passes its input
 * through unchanged (an identity graph) — good enough to exercise
 * evaluateRulePack's own shape-validation logic against a real zen-engine
 * evaluation, without needing a hand-authored real risk-grading rule pack.
 */
const IDENTITY_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'input', position: { x: 0, y: 0 } },
    { id: 'output1', type: 'outputNode', name: 'output', position: { x: 0, y: 0 } },
  ],
  edges: [{ id: 'e1', sourceId: 'input1', targetId: 'output1', type: 'edge' }],
};

describe('evaluateRulePack', () => {
  it('evaluates a well-formed decision graph and returns the parsed output', async () => {
    const result = await evaluateRulePack(IDENTITY_GRAPH, {
      overallRiskCategory: 'HIGH',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'HIGH',
          gradeRank: 3,
          isReferralTrigger: true,
          isEducationTrigger: false,
          isHrVisitTrigger: true,
          observedValueJson: { systolicBp: 145 },
        },
      ],
    });

    expect(result).toEqual({
      overallRiskCategory: 'HIGH',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'HIGH',
          gradeRank: 3,
          isReferralTrigger: true,
          isEducationTrigger: false,
          isHrVisitTrigger: true,
          observedValueJson: { systolicBp: 145 },
        },
      ],
    });
  });

  it('defaults observedValueJson to null when omitted', async () => {
    const result = await evaluateRulePack(IDENTITY_GRAPH, {
      overallRiskCategory: 'NORMAL',
      conditions: [
        {
          riskConditionId: 'cond-1',
          grade: 'NORMAL',
          gradeRank: 0,
          isReferralTrigger: false,
          isEducationTrigger: false,
          isHrVisitTrigger: false,
        },
      ],
    });

    expect(result.conditions[0]).toEqual({
      riskConditionId: 'cond-1',
      grade: 'NORMAL',
      gradeRank: 0,
      isReferralTrigger: false,
      isEducationTrigger: false,
      isHrVisitTrigger: false,
      observedValueJson: null,
    });
  });

  it('rejects a condition entry with a missing (non-boolean) trigger field, rather than silently defaulting to false', async () => {
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, {
        overallRiskCategory: 'NORMAL',
        conditions: [{ riskConditionId: 'cond-1', grade: 'NORMAL', gradeRank: 0 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a condition entry whose trigger field is the string "false", rather than coercing it truthy', async () => {
    // Regression test: Boolean("false") === true — a decision graph authored
    // visually (not in code) that happens to emit the literal string "false"
    // for a trigger column must be rejected, not silently flip the trigger on.
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, {
        overallRiskCategory: 'NORMAL',
        conditions: [
          {
            riskConditionId: 'cond-1',
            grade: 'NORMAL',
            gradeRank: 0,
            isReferralTrigger: 'false',
            isEducationTrigger: false,
            isHrVisitTrigger: false,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an output that is not an object', async () => {
    // The identity graph reflects whatever `answers` is back as the raw
    // evaluation result — passing a non-object here is the simplest way to
    // make zen-engine's real `result` a non-object, exercising
    // evaluateRulePack's own runtime shape guard (the DTO's z.record type
    // wouldn't allow this at the HTTP boundary; this tests defense-in-depth
    // for whatever a rule pack's decision graph can actually emit).
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, 'not-an-object' as unknown as Record<string, unknown>),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects an output missing overallRiskCategory', async () => {
    await expect(evaluateRulePack(IDENTITY_GRAPH, { conditions: [] })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects an output with an invalid overallRiskCategory value', async () => {
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, { overallRiskCategory: 'WORST', conditions: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an output whose conditions is not an array', async () => {
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, { overallRiskCategory: 'NORMAL', conditions: {} }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a condition entry missing riskConditionId', async () => {
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, {
        overallRiskCategory: 'NORMAL',
        conditions: [{ grade: 'NORMAL', gradeRank: 0 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a condition entry missing grade', async () => {
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, {
        overallRiskCategory: 'NORMAL',
        conditions: [{ riskConditionId: 'cond-1', gradeRank: 0 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a condition entry with a non-numeric gradeRank', async () => {
    await expect(
      evaluateRulePack(IDENTITY_GRAPH, {
        overallRiskCategory: 'NORMAL',
        conditions: [{ riskConditionId: 'cond-1', grade: 'NORMAL', gradeRank: 'zero' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
