import {
  buildLocalImportGraph,
  detectArchitecturePolicyViolations,
  detectDependencyCycles,
  summarizeDirectories,
  summarizeGraphNodes,
  summarizeLayers,
} from "./architecture-graph.js";
import { isTestPath } from "./discovery.js";
import { makeEvidence, type AdapterContext, type AdapterResult } from "./evidence-core.js";
import { stableId } from "./ids.js";
import type { EvidenceRecord } from "./types.js";

export async function codeGraphAdapter(context: AdapterContext): Promise<AdapterResult> {
  const graph = buildLocalImportGraph(context.files.filter((file) => !isTestPath(file.path)));
  const nodes = summarizeGraphNodes(graph, context.config.architecture);
  const hotspots = [...nodes]
    .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing))
    .slice(0, 40);
  const directories = summarizeDirectories(nodes, graph.edges);
  const cycles = detectDependencyCycles(graph, context.config.architecture.maxCycles);
  const policyViolations = detectArchitecturePolicyViolations(graph, context.config.architecture);
  const layers = summarizeLayers(graph, context.config.architecture);
  const files = hotspots.slice(0, 12).map((node) => ({ path: node.path }));

  return {
    evidence: [makeEvidence(context, {
      id: stableId("ev", `code-graph:${graph.nodes.size}:${graph.edges.length}:${hotspots.map((node) => node.path).join("|")}`),
      adapter: "code-graph",
      kind: "code-graph-summary",
      title: "Local import graph summary",
      summary: `The local source graph contains ${graph.nodes.size} files, ${graph.edges.length} local import edges, ${cycles.length} cycles, and ${policyViolations.length} architecture policy violations across ${directories.length} directories.`,
      files,
      data: {
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.length,
        cycleCount: cycles.length,
        policyViolationCount: policyViolations.length,
        hotspots,
        directories,
        layers,
        cycles: cycles.slice(0, 80),
        policyViolations: policyViolations.slice(0, 120),
        edges: graph.edges.slice(0, 800),
        nodes: nodes.slice(0, 300),
      },
      confidence: graph.edges.length > 0 ? "high" : "low",
    }),
    ...cycles.map((cycle, index) => makeEvidence(context, {
      id: stableId("ev", `dependency-cycle:${cycle.files.join(">")}`),
      adapter: "code-graph",
      kind: "dependency-cycle",
      title: `Dependency cycle across ${cycle.files.length - 1} files`,
      summary: `Local imports form a cycle: ${cycle.files.join(" -> ")}.`,
      files: cycle.files.slice(0, -1).map((filePath) => ({ path: filePath })),
      data: {
        cycle: cycle.files,
        length: cycle.files.length - 1,
        index,
      },
      confidence: cycle.files.length > 3 ? "high" : "medium",
    })),
    ...policyViolations.map((violation) => makeEvidence(context, {
      id: stableId("ev", `architecture-boundary:${violation.from}:${violation.to}:${violation.fromLayer}:${violation.toLayer}`),
      adapter: "code-graph",
      kind: "architecture-boundary-violation",
      title: `Architecture boundary violation: ${violation.fromLayer} imports ${violation.toLayer}`,
      summary: `${violation.from} is in layer ${violation.fromLayer} but imports ${violation.to} in disallowed layer ${violation.toLayer}.`,
      files: [{ path: violation.from }, { path: violation.to }],
      data: {
        from: violation.from,
        to: violation.to,
        fromLayer: violation.fromLayer,
        toLayer: violation.toLayer,
        allowedLayers: violation.allowedLayers,
      },
      confidence: "high",
    }))],
    diagnostics: [],
  };
}

export async function importGraphAdapter(context: AdapterContext): Promise<AdapterResult> {
  const graph = buildLocalImportGraph(context.files.filter((file) => !isTestPath(file.path)));

  const evidence: EvidenceRecord[] = [];
  for (const [filePath, node] of graph.nodes.entries()) {
    const incoming = node.importedBy.size;
    const outgoing = node.imports.size;
    if (incoming < 4 && outgoing < 8) {
      continue;
    }

    evidence.push(makeEvidence(context, {
      id: stableId("ev", `import-graph:${filePath}:${incoming}:${outgoing}`),
      adapter: "import-graph",
      kind: "dependency-hotspot",
      title: `Dependency hotspot: ${filePath}`,
      summary: `${filePath} has ${incoming} incoming and ${outgoing} outgoing local dependencies.`,
      files: [{ path: filePath }],
      data: {
        incoming,
        outgoing,
        imports: [...node.imports],
        importedBy: [...node.importedBy],
      },
      confidence: incoming >= 8 || outgoing >= 12 ? "high" : "medium",
    }));
  }

  return { evidence, diagnostics: [] };
}
