import path from "node:path";
import ts from "typescript";
import { normalizePath, type SourceFile } from "./discovery.js";
import type { DeepcleanConfig } from "./types.js";

export type ArchitecturePolicy = DeepcleanConfig["architecture"];

export interface ArchitectureGraphNode {
  imports: Set<string>;
  importedBy: Set<string>;
}

export interface ArchitectureGraph {
  nodes: Map<string, ArchitectureGraphNode>;
  edges: ArchitectureGraphEdge[];
}

export interface ArchitectureGraphEdge {
  from: string;
  to: string;
}

export interface ArchitectureGraphNodeSummary {
  path: string;
  directory: string;
  topLevel: string;
  incoming: number;
  outgoing: number;
  layer?: string;
}

export interface ArchitectureDirectorySummary {
  path: string;
  fileCount: number;
  internalEdges: number;
  incomingEdges: number;
  outgoingEdges: number;
}

export interface ArchitecturePolicyViolation {
  from: string;
  to: string;
  fromLayer: string;
  toLayer: string;
  allowedLayers: string[];
}

export interface ArchitectureLayerSummary {
  name: string;
  fileCount: number;
  incomingEdges: number;
  outgoingEdges: number;
}

export interface ArchitectureCycle {
  files: string[];
}

export function buildLocalImportGraph(files: SourceFile[]): ArchitectureGraph {
  const sourcePaths = new Set(files.map((file) => file.path));
  const nodes = new Map<string, ArchitectureGraphNode>();
  const edges: ArchitectureGraphEdge[] = [];

  for (const file of files) {
    nodes.set(file.path, { imports: new Set(), importedBy: new Set() });
  }

  for (const file of files) {
    const node = nodes.get(file.path);
    if (!node) {
      continue;
    }
    const imports = collectImports(file)
      .map((specifier) => resolveImportPath(file.path, specifier, sourcePaths))
      .filter((value): value is string => Boolean(value));
    for (const imported of new Set(imports)) {
      node.imports.add(imported);
      const target = nodes.get(imported);
      if (target) {
        target.importedBy.add(file.path);
      }
      edges.push({ from: file.path, to: imported });
    }
  }

  edges.sort((a, b) => graphEdgeKey(a).localeCompare(graphEdgeKey(b)));
  return { nodes, edges };
}

export function summarizeGraphNodes(
  graph: ArchitectureGraph,
  policy?: ArchitecturePolicy,
): ArchitectureGraphNodeSummary[] {
  return [...graph.nodes.entries()].map(([filePath, node]) => ({
    path: filePath,
    directory: moduleDirectory(filePath),
    topLevel: filePath.split("/")[0] ?? ".",
    incoming: node.importedBy.size,
    outgoing: node.imports.size,
    ...(policy ? optionalLayer(filePath, policy) : {}),
  }));
}

export function summarizeLayers(graph: ArchitectureGraph, policy: ArchitecturePolicy): ArchitectureLayerSummary[] {
  const summaries = new Map<string, ArchitectureLayerSummary>();
  for (const layer of policy.layers) {
    summaries.set(layer.name, {
      name: layer.name,
      fileCount: 0,
      incomingEdges: 0,
      outgoingEdges: 0,
    });
  }
  for (const filePath of graph.nodes.keys()) {
    const layer = layerForPath(filePath, policy);
    if (layer) {
      const summary = summaries.get(layer);
      if (summary) {
        summary.fileCount += 1;
      }
    }
  }
  for (const edge of graph.edges) {
    const fromLayer = layerForPath(edge.from, policy);
    const toLayer = layerForPath(edge.to, policy);
    if (!fromLayer || !toLayer || fromLayer === toLayer) {
      continue;
    }
    const fromSummary = summaries.get(fromLayer);
    const toSummary = summaries.get(toLayer);
    if (fromSummary) {
      fromSummary.outgoingEdges += 1;
    }
    if (toSummary) {
      toSummary.incomingEdges += 1;
    }
  }
  return [...summaries.values()].filter((summary) => summary.fileCount > 0 || summary.incomingEdges > 0 || summary.outgoingEdges > 0);
}

export function detectArchitecturePolicyViolations(
  graph: ArchitectureGraph,
  policy: ArchitecturePolicy,
): ArchitecturePolicyViolation[] {
  if (policy.layers.length === 0 || policy.rules.length === 0) {
    return [];
  }
  const rules = new Map(policy.rules.map((rule) => [rule.from, rule.allow]));
  const violations: ArchitecturePolicyViolation[] = [];
  for (const edge of graph.edges) {
    const fromLayer = layerForPath(edge.from, policy);
    const toLayer = layerForPath(edge.to, policy);
    if (!fromLayer || !toLayer) {
      continue;
    }
    const allowedLayers = rules.get(fromLayer);
    if (!allowedLayers || allowedLayers.includes("*") || allowedLayers.includes(toLayer)) {
      continue;
    }
    violations.push({
      from: edge.from,
      to: edge.to,
      fromLayer,
      toLayer,
      allowedLayers,
    });
    if (violations.length >= policy.maxPolicyViolations) {
      break;
    }
  }
  return violations.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

export function detectDependencyCycles(graph: ArchitectureGraph, maxCycles: number): ArchitectureCycle[] {
  if (maxCycles <= 0) {
    return [];
  }
  const adjacency = new Map<string, string[]>();
  for (const filePath of graph.nodes.keys()) {
    adjacency.set(filePath, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }
  for (const targets of adjacency.values()) {
    targets.sort();
  }

  const cycles: ArchitectureCycle[] = [];
  const seen = new Set<string>();
  for (const start of [...graph.nodes.keys()].sort()) {
    dfsCycle(start, start, adjacency, [], new Set(), seen, cycles, maxCycles);
    if (cycles.length >= maxCycles) {
      break;
    }
  }
  return cycles.sort((a, b) => a.files.join(">").localeCompare(b.files.join(">")));
}

export function layerForPath(filePath: string, policy: ArchitecturePolicy): string | undefined {
  for (const layer of policy.layers) {
    if (layer.pathPatterns.some((pattern) => pathMatchesPattern(filePath, pattern))) {
      return layer.name;
    }
  }
  return undefined;
}

export function summarizeDirectories(
  nodes: ArchitectureGraphNodeSummary[],
  edges: ArchitectureGraphEdge[],
): ArchitectureDirectorySummary[] {
  const summaries = new Map<string, ArchitectureDirectorySummary>();
  for (const node of nodes) {
    const current = summaries.get(node.directory) ?? {
      path: node.directory,
      fileCount: 0,
      internalEdges: 0,
      incomingEdges: 0,
      outgoingEdges: 0,
    };
    current.fileCount += 1;
    summaries.set(node.directory, current);
  }

  for (const edge of edges) {
    const fromDir = moduleDirectory(edge.from);
    const toDir = moduleDirectory(edge.to);
    const fromSummary = summaries.get(fromDir);
    const toSummary = summaries.get(toDir);
    if (fromDir === toDir) {
      if (fromSummary) {
        fromSummary.internalEdges += 1;
      }
      continue;
    }
    if (fromSummary) {
      fromSummary.outgoingEdges += 1;
    }
    if (toSummary) {
      toSummary.incomingEdges += 1;
    }
  }

  return [...summaries.values()]
    .sort((a, b) => (
      (b.fileCount + b.internalEdges + b.incomingEdges + b.outgoingEdges)
      - (a.fileCount + a.internalEdges + a.incomingEdges + a.outgoingEdges)
    ))
    .slice(0, 40);
}

export function moduleDirectory(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) {
    return ".";
  }
  if (parts.includes("src")) {
    const srcIndex = parts.indexOf("src");
    return parts.slice(0, Math.min(parts.length - 1, srcIndex + 3)).join("/");
  }
  return parts.slice(0, Math.min(parts.length - 1, 2)).join("/");
}

export function graphEdgeKey(edge: ArchitectureGraphEdge): string {
  return `${edge.from}->${edge.to}`;
}

export function symmetricGraphEdgeKeys(edges: ArchitectureGraphEdge[]): Set<string> {
  const keys = new Set<string>();
  for (const edge of edges) {
    keys.add(graphEdgeKey(edge));
    keys.add(graphEdgeKey({ from: edge.to, to: edge.from }));
  }
  return keys;
}

function optionalLayer(filePath: string, policy: ArchitecturePolicy): { layer: string } | Record<string, never> {
  const layer = layerForPath(filePath, policy);
  return layer ? { layer } : {};
}

function dfsCycle(
  start: string,
  current: string,
  adjacency: Map<string, string[]>,
  stack: string[],
  visiting: Set<string>,
  seen: Set<string>,
  cycles: ArchitectureCycle[],
  maxCycles: number,
): void {
  if (cycles.length >= maxCycles) {
    return;
  }
  const pathStack = [...stack, current];
  visiting.add(current);
  for (const next of adjacency.get(current) ?? []) {
    if (next === start && pathStack.length > 1) {
      const cycle = [...pathStack, start];
      const key = canonicalCycleKey(cycle);
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push({ files: cycle });
      }
      if (cycles.length >= maxCycles) {
        break;
      }
      continue;
    }
    if (visiting.has(next) || next < start) {
      continue;
    }
    dfsCycle(start, next, adjacency, pathStack, new Set(visiting), seen, cycles, maxCycles);
  }
}

function canonicalCycleKey(cycle: string[]): string {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)].join(">"));
  const reversed = [...nodes].reverse();
  rotations.push(...reversed.map((_, index) => [...reversed.slice(index), ...reversed.slice(0, index)].join(">")));
  return rotations.sort()[0] ?? nodes.join(">");
}

function pathMatchesPattern(filePath: string, pattern: string): boolean {
  return globToRegex(normalizePath(pattern)).test(filePath);
}

function globToRegex(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegex(char ?? "");
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function collectImports(file: SourceFile): string[] {
  if (file.extension === ".py") {
    return collectPythonImports(file);
  }
  const sourceFile = ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.Latest,
    true,
    file.extension.includes("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  visitNode(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteral(argument)) {
        return;
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        imports.push(argument.text);
        return;
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        imports.push(argument.text);
      }
    }
  });
  return imports;
}

export function resolveImportPath(
  fromPath: string,
  specifier: string,
  sourcePaths: Set<string>,
): string | undefined {
  if (path.posix.extname(fromPath) === ".py") {
    return resolvePythonImportPath(fromPath, specifier, sourcePaths);
  }
  const base = specifier.startsWith(".")
    ? normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier)))
    : specifier.startsWith("@/")
      ? aliasImportBase(fromPath, specifier)
      : normalizePath(specifier.replace(/\./g, "/"));
  const candidates = importPathCandidates(base);
  return candidates.find((candidate) => sourcePaths.has(candidate));
}

function resolvePythonImportPath(
  fromPath: string,
  specifier: string,
  sourcePaths: Set<string>,
): string | undefined {
  const fromDir = path.posix.dirname(fromPath);
  const base = normalizePath(specifier.startsWith(".")
    ? path.posix.join(pythonRelativeImportBase(fromDir, specifier), specifier.replace(/^\.+/, "").replace(/\./g, "/"))
    : specifier.replace(/\./g, "/"));
  const candidates = [
    base,
    `${base}.py`,
    `${base}/__init__.py`,
  ];
  return candidates.find((candidate) => sourcePaths.has(candidate));
}

function pythonRelativeImportBase(fromDir: string, specifier: string): string {
  const leadingDots = specifier.match(/^\.+/)?.[0].length ?? 0;
  let base = fromDir;
  for (let index = 1; index < leadingDots; index += 1) {
    base = path.posix.dirname(base);
  }
  return base;
}

function importPathCandidates(base: string): string[] {
  const extension = path.posix.extname(base);
  const withoutExtension = extension ? base.slice(0, -extension.length) : base;
  const emittedJsSourceCandidates = [".js", ".jsx", ".mjs", ".cjs"].includes(extension)
    ? [
      `${withoutExtension}.ts`,
      `${withoutExtension}.tsx`,
      `${withoutExtension}.mts`,
      `${withoutExtension}.cts`,
      `${withoutExtension}.js`,
      `${withoutExtension}.jsx`,
      `${withoutExtension}.mjs`,
      `${withoutExtension}.cjs`,
    ]
    : [];
  const candidates = [
    base,
    ...emittedJsSourceCandidates,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.py`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.mts`,
    `${base}/index.cts`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.mjs`,
    `${base}/index.cjs`,
    `${base}/__init__.py`,
  ];
  return [...new Set(candidates)];
}

function aliasImportBase(fromPath: string, specifier: string): string {
  const srcMarker = "/src/";
  const srcIndex = fromPath.indexOf(srcMarker);
  if (srcIndex >= 0) {
    return normalizePath(`${fromPath.slice(0, srcIndex)}${srcMarker}${specifier.slice(2)}`);
  }
  return normalizePath(`src/${specifier.slice(2)}`);
}

function collectPythonImports(file: SourceFile): string[] {
  const imports: string[] = [];
  for (const line of file.lines) {
    const fromMatch = line.match(/^\s*from\s+([.\w]+)\s+import\s+/);
    if (fromMatch?.[1]) {
      imports.push(fromMatch[1]);
      continue;
    }
    const importMatch = line.match(/^\s*import\s+([.\w]+)/);
    if (importMatch?.[1]) {
      imports.push(importMatch[1]);
    }
  }
  return imports;
}

function visitNode(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  node.forEachChild((child) => visitNode(child, visitor));
}
