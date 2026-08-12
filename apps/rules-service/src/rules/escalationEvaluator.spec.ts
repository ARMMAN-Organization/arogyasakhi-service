import { evaluateEscalationPack } from './escalationEvaluator';

/**
 * A minimal gorules decision graph whose output node passes its input
 * unchanged (an identity graph) — good enough to exercise
 * evaluateEscalationPack's own shape-validation logic against a real
 * zen-engine evaluation, same technique as ruleSet.evaluator.spec.ts /
 * scheduleEvaluator.spec.ts's IDENTITY_GRAPH.
 */
const IDENTITY_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'input', position: { x: 0, y: 0 } },
    { id: 'output1', type: 'outputNode', name: 'output', position: { x: 0, y: 0 } },
  ],
  edges: [{ id: 'e1', sourceId: 'input1', targetId: 'output1', type: 'edge' }],
};

describe('evaluateEscalationPack', () => {
  it('passes a well-formed output through unchanged', async () => {
    const result = await evaluateEscalationPack(IDENTITY_GRAPH, {
      shouldEscalate: true,
      reasonCode: 'X',
    });
    expect(result).toEqual({ shouldEscalate: true, reasonCode: 'X' });
  });

  it('rejects an output missing shouldEscalate', async () => {
    await expect(evaluateEscalationPack(IDENTITY_GRAPH, { reasonCode: 'X' })).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it('rejects an output missing reasonCode', async () => {
    await expect(
      evaluateEscalationPack(IDENTITY_GRAPH, { shouldEscalate: true }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an output whose shouldEscalate is not a boolean', async () => {
    await expect(
      evaluateEscalationPack(IDENTITY_GRAPH, { shouldEscalate: 'true', reasonCode: 'X' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an output whose reasonCode is not a string', async () => {
    await expect(
      evaluateEscalationPack(IDENTITY_GRAPH, { shouldEscalate: true, reasonCode: 123 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('tolerates extra unexpected fields on the output (permissive, matches validateAnc etc.)', async () => {
    const result = await evaluateEscalationPack(IDENTITY_GRAPH, {
      shouldEscalate: false,
      reasonCode: 'BELOW_THRESHOLD',
      unexpectedField: 'ignored',
    });
    expect(result).toEqual({ shouldEscalate: false, reasonCode: 'BELOW_THRESHOLD' });
  });
});
