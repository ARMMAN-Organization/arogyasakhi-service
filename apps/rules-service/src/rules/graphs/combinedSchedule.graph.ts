import { ANC_DECISION_GRAPH } from './anc.graph';
import { PP_DECISION_GRAPH } from './pp.graph';
import { NN_DECISION_GRAPH } from './nn.graph';
import { INC_DECISION_GRAPH } from './inc.graph';
import { CCV_DECISION_GRAPH } from './ccv.graph';

/**
 * Combines the five per-family SCHEDULE decision graphs (anc/pp/nn/inc/ccv)
 * into one JDM graph, branched on `visitFamily` by a switchNode — required
 * because the Sakhi mobile app's HardcodedRuleSource hardcodes a single
 * SCHEDULE_RULE_VERSION_ID (see prisma/seed.ts) and there is no existing
 * mechanism for it to reference five separate rule sets.
 *
 * Each family sub-graph's nodes/edges are namespaced with a `${family}__`
 * prefix (their internal node ids would otherwise collide, e.g. every
 * family graph has an `input1`/`output1`). The switchNode's single incoming
 * edge fans out to each family's first real node (skipping that family's own
 * inputNode, which becomes redundant once the top-level switch already
 * carries the full request context) and each family's outputNode is rewired
 * to feed the combined graph's own single outputNode.
 */
function namespaceGraph(family: string, graph: { nodes: unknown[]; edges: unknown[] }) {
  const prefix = `${family}__`;
  const nodes = (graph.nodes as Array<Record<string, unknown>>).map((n) => ({
    ...n,
    id: `${prefix}${n.id}`,
  }));
  const edges = (graph.edges as Array<Record<string, unknown>>).map((e) => ({
    ...e,
    id: `${prefix}${e.id}`,
    sourceId: `${prefix}${e.sourceId}`,
    targetId: `${prefix}${e.targetId}`,
  }));
  return { prefix, nodes, edges };
}

function buildCombinedGraph() {
  const families: Array<{ key: string; graph: { nodes: unknown[]; edges: unknown[] } }> = [
    { key: 'ANC', graph: ANC_DECISION_GRAPH },
    { key: 'PP', graph: PP_DECISION_GRAPH },
    { key: 'NN', graph: NN_DECISION_GRAPH },
    { key: 'INC', graph: INC_DECISION_GRAPH },
    { key: 'CCV', graph: CCV_DECISION_GRAPH },
  ];

  const switchStatements = families.map((f) => ({
    id: `s_${f.key}`,
    condition: `visitFamily == '${f.key}'`,
  }));

  const allNodes: unknown[] = [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'switch1',
      type: 'switchNode',
      name: 'branchByFamily',
      position: { x: 150, y: 0 },
      content: { hitPolicy: 'first', statements: switchStatements },
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 900, y: 0 } },
  ];
  const allEdges: unknown[] = [
    { id: 'e_input_switch', sourceId: 'input1', targetId: 'switch1', type: 'edge' },
  ];

  families.forEach((f, index) => {
    const { prefix, nodes, edges } = namespaceGraph(f.key, f.graph);
    // Drop each family's own inputNode — the top-level switch1 already
    // carries the full request context to whichever node the family's
    // original inputNode used to feed.
    const familyInputNode = (f.graph.nodes as Array<Record<string, unknown>>).find(
      (n) => n.type === 'inputNode',
    ) as Record<string, unknown>;
    const familyOutputNode = (f.graph.nodes as Array<Record<string, unknown>>).find(
      (n) => n.type === 'outputNode',
    ) as Record<string, unknown>;
    const namespacedInputId = `${prefix}${familyInputNode.id}`;
    const namespacedOutputId = `${prefix}${familyOutputNode.id}`;

    allNodes.push(...nodes.filter((n) => (n as Record<string, unknown>).id !== namespacedInputId));

    for (const edge of edges as Array<Record<string, unknown>>) {
      if (edge.sourceId === namespacedInputId) {
        // Redirect: switch1 -> (whatever the family's inputNode used to feed).
        allEdges.push({
          id: `e_switch_${f.key}_${index}`,
          sourceId: 'switch1',
          targetId: edge.targetId,
          type: 'edge',
          sourceHandle: `s_${f.key}`,
        });
      } else if (edge.targetId === namespacedOutputId) {
        // Redirect: (whatever fed the family's outputNode) -> output1.
        allEdges.push({ ...edge, targetId: 'output1' });
      } else {
        allEdges.push(edge);
      }
    }
  });

  return {
    contentType: 'application/vnd.gorules.decision',
    nodes: allNodes,
    edges: allEdges,
  };
}

/**
 * The single SCHEDULE rule pack seeded as SCHEDULE_RULE_VERSION_ID's
 * rulesJson — branches on `visitFamily` (ANC/PP/NN/INC/CCV) to the matching
 * family sub-graph. See scheduleOrchestrator.ts for how each family's
 * per-mode input contract is driven.
 */
export const COMBINED_SCHEDULE_DECISION_GRAPH = buildCombinedGraph();
