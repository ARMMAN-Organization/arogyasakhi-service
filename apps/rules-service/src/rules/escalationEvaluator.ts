import { ZenDecisionContent, ZenEngine } from '@gorules/zen-engine';
import { badRequest } from '@armman/service-commons';

/**
 * Shape-validated result of an ESCALATION rule pack evaluation (SRS
 * §3A.2.7 FR-S-7.1) — whether a missed-visit streak should escalate to a
 * Supervisor, and the reasonCode explaining the decision either way.
 */
export interface EscalationEvaluation {
  shouldEscalate: boolean;
  reasonCode: string;
}

/**
 * Runs a published ESCALATION rule version's gorules decision graph against
 * `input` and returns its shape-validated result. Same execution pattern as
 * scheduleEvaluator.ts's evaluateSchedulePack — fresh ZenEngine/
 * ZenDecisionContent per call — but with a single fixed output contract
 * (unlike SCHEDULE's per-scheduleKind shapes), since ESCALATION has exactly
 * one input/output shape across every visitFamily.
 *
 * Throws badRequest() if the decision graph's output isn't
 * `{ shouldEscalate: boolean, reasonCode: string }` — a malformed rule pack
 * must surface as a client (400) error, not a 500 masking a config problem.
 * Extra unexpected fields on the output are tolerated (not rejected), same
 * permissive-on-extras convention as scheduleEvaluator.ts's validateXxx
 * functions. A zen-engine evaluation throw (e.g. an unrecognized
 * visitFamily) propagates as-is — this evaluator does not catch/rewrap it,
 * matching ruleSet.evaluator.ts's documented convention that "zen-engine's
 * own evaluation errors ... propagate as-is; the controller/service layer
 * decides how those map to HTTP status."
 */
export async function evaluateEscalationPack(
  rulesJson: unknown,
  input: Record<string, unknown>,
): Promise<EscalationEvaluation> {
  const engine = new ZenEngine();
  const content = new ZenDecisionContent(rulesJson as object);
  const decision = engine.createDecision(content);
  let response;
  try {
    response = await decision.evaluate(input);
  } finally {
    engine.dispose();
  }

  const result = response.result;
  if (typeof result !== 'object' || result === null) {
    throw badRequest(
      "This ESCALATION rule pack's decision graph did not return a { shouldEscalate, reasonCode } object.",
    );
  }
  const r = result as Record<string, unknown>;

  if (typeof r.shouldEscalate !== 'boolean') {
    throw badRequest('ESCALATION output must include a boolean shouldEscalate.');
  }
  if (typeof r.reasonCode !== 'string') {
    throw badRequest('ESCALATION output must include a string reasonCode.');
  }

  return { shouldEscalate: r.shouldEscalate, reasonCode: r.reasonCode };
}
