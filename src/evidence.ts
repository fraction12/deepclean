import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";
import { isTestPath, normalizePath, type SourceFile } from "./discovery.js";
import { stableId } from "./ids.js";
import { schemaVersion, type DeepcleanConfig, type Diagnostic, type EvidenceRecord } from "./types.js";

const execFileAsync = promisify(execFile);

export interface AdapterContext {
  root: string;
  runId: string;
  createdAt: string;
  files: SourceFile[];
  config: DeepcleanConfig;
}

export interface AdapterResult {
  evidence: EvidenceRecord[];
  diagnostics: Diagnostic[];
}

export type EvidenceAdapter = (context: AdapterContext) => Promise<AdapterResult>;

export const evidenceAdapters: Record<string, EvidenceAdapter> = {
  "file-metrics": fileMetricsAdapter,
  "line-window-duplication": duplicationAdapter,
  "jscpd": jscpdAdapter,
  "semgrep": semgrepAdapter,
  "sarif-ingest": sarifIngestAdapter,
  "code-graph": codeGraphAdapter,
  "import-graph": importGraphAdapter,
  "typescript-structure": typescriptStructureAdapter,
  "git-history": gitHistoryAdapter,
  "test-discovery": testDiscoveryAdapter,
};

export async function runEvidenceAdapters(
  enabledAdapters: string[],
  context: AdapterContext,
): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const adapterName of enabledAdapters) {
    const adapter = evidenceAdapters[adapterName];
    if (!adapter) {
      diagnostics.push({
        level: "warning",
        code: "adapter_unknown",
        message: `Unknown evidence adapter: ${adapterName}`,
        adapter: adapterName,
      });
      continue;
    }

    try {
      const result = await adapter(context);
      evidence.push(...result.evidence);
      diagnostics.push(...result.diagnostics);
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "adapter_failed",
        message: error instanceof Error ? error.message : String(error),
        adapter: adapterName,
      });
    }
  }

  return { evidence, diagnostics };
}

async function jscpdAdapter(context: AdapterContext): Promise<AdapterResult> {
  const settings = context.config.externalAnalyzers.jscpd;
  if (!settings.enabled) {
    return { evidence: [], diagnostics: [] };
  }

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-jscpd-"));
  try {
    await execFileAsync(settings.command, [
      "--silent",
      "--min-tokens",
      String(settings.minTokens),
      "--reporters",
      "json",
      "--output",
      outputDir,
      context.root,
    ], { maxBuffer: 1024 * 1024 * 20 });

    const report = await readFirstJsonReport(outputDir);
    const duplicates = Array.isArray(report["duplicates"]) ? report["duplicates"] : [];
    const sourcePathSet = new Set(context.files.map((file) => file.path));
    const evidence: EvidenceRecord[] = [];
    for (const duplicate of duplicates.slice(0, settings.maxFindings)) {
      if (!isObject(duplicate)) {
        continue;
      }
      const files = duplicateFiles(duplicate, context.root).filter((file) => sourcePathSet.has(file.path));
      const uniquePaths = new Set(files.map((file) => file.path));
      if (uniquePaths.size < 2) {
        continue;
      }
      const lines = typeof duplicate["lines"] === "number" ? duplicate["lines"] : undefined;
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `jscpd:${[...uniquePaths].join("|")}:${lines ?? ""}`),
        adapter: "jscpd",
        kind: "external-duplicate",
        title: `jscpd duplicate across ${uniquePaths.size} files`,
        summary: `jscpd reported a duplicate block across ${uniquePaths.size} files${lines ? ` spanning about ${lines} lines` : ""}.`,
        files,
        data: compactObject(duplicate, ["fragment"]),
        confidence: uniquePaths.size >= 3 ? "high" : "medium",
      }));
    }

    return { evidence, diagnostics: [] };
  } catch (error) {
    return {
      evidence: [],
      diagnostics: [{
        level: "info",
        code: "jscpd_unavailable",
        message: `jscpd adapter skipped: ${error instanceof Error ? error.message : String(error)}`,
        adapter: "jscpd",
      }],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function semgrepAdapter(context: AdapterContext): Promise<AdapterResult> {
  const settings = context.config.externalAnalyzers.semgrep;
  if (!settings.enabled) {
    return { evidence: [], diagnostics: [] };
  }

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-semgrep-"));
  const outputPath = path.join(outputDir, "semgrep.sarif");
  try {
    await execFileAsync(settings.command, [
      "scan",
      "--config",
      settings.config,
      "--sarif",
      "--output",
      outputPath,
      context.root,
    ], {
      maxBuffer: 1024 * 1024 * 20,
      timeout: settings.timeoutMs,
    });
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return {
      evidence: evidenceFromSarif(context, parsed, `semgrep:${settings.config}`).slice(0, settings.maxFindings),
      diagnostics: [],
    };
  } catch (error) {
    return {
      evidence: [],
      diagnostics: [{
        level: "info",
        code: "semgrep_unavailable",
        message: `Semgrep adapter skipped: ${error instanceof Error ? error.message : String(error)}`,
        adapter: "semgrep",
      }],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function sarifIngestAdapter(context: AdapterContext): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];
  for (const sarifPath of context.config.externalAnalyzers.sarifPaths) {
    const absolutePath = path.resolve(context.root, sarifPath);
    let raw: string;
    try {
      raw = await readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    const parsed = JSON.parse(raw) as unknown;
    evidence.push(...evidenceFromSarif(context, parsed, sarifPath));
  }

  return { evidence: evidence.slice(0, 80), diagnostics: [] };
}

function evidenceFromSarif(context: AdapterContext, parsed: unknown, sarifPath: string): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = [];
  if (!isObject(parsed) || !Array.isArray(parsed["runs"])) {
    return evidence;
  }
  for (const run of parsed["runs"]) {
    if (!isObject(run) || !Array.isArray(run["results"])) {
      continue;
    }
    const toolName = sarifToolName(run);
    for (const result of run["results"].slice(0, 50)) {
      if (!isObject(result)) {
        continue;
      }
      const files = sarifFiles(result);
      if (files.length === 0) {
        continue;
      }
      const title = sarifTitle(result);
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `sarif:${sarifPath}:${title}:${files.map((file) => `${file.path}:${file.startLine ?? ""}`).join("|")}`),
        adapter: sarifPath.startsWith("semgrep:") ? "semgrep" : "sarif-ingest",
        kind: "sarif-finding",
        title,
        summary: `${toolName} reported ${title}.`,
        files,
        data: {
          sarifPath,
          toolName,
          ruleId: typeof result["ruleId"] === "string" ? result["ruleId"] : undefined,
          level: typeof result["level"] === "string" ? result["level"] : undefined,
        },
        confidence: sarifConfidence(result),
      }));
    }
  }
  return evidence;
}

function makeEvidence(
  context: AdapterContext,
  values: Omit<EvidenceRecord, "schemaVersion" | "recordType" | "runId" | "createdAt" | "affectedFeatureIds" | "fileRoles"> &
    Partial<Pick<EvidenceRecord, "affectedFeatureIds" | "fileRoles">>,
): EvidenceRecord {
  return {
    schemaVersion,
    recordType: "evidence",
    runId: context.runId,
    createdAt: context.createdAt,
    affectedFeatureIds: [],
    fileRoles: [],
    ...values,
  };
}

async function fileMetricsAdapter(context: AdapterContext): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];

  for (const file of context.files) {
    const nonBlank = file.lines.filter((line) => line.trim().length > 0).length;
    if (nonBlank < 220) {
      continue;
    }

    evidence.push(makeEvidence(context, {
      id: stableId("ev", `file-metrics:${file.path}:${nonBlank}`),
      adapter: "file-metrics",
      kind: "large-file",
      title: `Large source file: ${file.path}`,
      summary: `${file.path} has ${nonBlank} non-blank lines, which is a useful maintainability hotspot for review.`,
      files: [{ path: file.path, startLine: 1, endLine: file.lines.length }],
      data: { nonBlankLines: nonBlank, totalLines: file.lines.length },
      confidence: nonBlank >= 500 ? "high" : "medium",
    }));
  }

  return { evidence, diagnostics: [] };
}

async function duplicationAdapter(context: AdapterContext): Promise<AdapterResult> {
  const windows = new Map<string, Array<{ file: SourceFile; startLine: number; text: string }>>();
  const windowSize = 6;

  for (const file of context.files.filter((item) => !isTestPath(item.path))) {
    const normalized = file.lines.map((line) => line
      .trim()
      .replace(/\s+/g, " ")
      .replace(/["'`][^"'`]*["'`]/g, "<string>")
      .replace(/\b\d+(?:\.\d+)?\b/g, "<number>"));
    for (let index = 0; index <= normalized.length - windowSize; index += 1) {
      const slice = normalized.slice(index, index + windowSize);
      if (slice.filter(Boolean).length < windowSize) {
        continue;
      }
      if (slice.every((line) => /^["'`<][^=({]*["'`>]?,?$/.test(line.trim()))) {
        continue;
      }
      if (slice.filter((line) => /[=({.]|return|if |for |while /.test(line)).length < 3) {
        continue;
      }
      const key = slice.join("\n");
      const existing = windows.get(key) ?? [];
      existing.push({
        file,
        startLine: index + 1,
        text: file.lines.slice(index, index + windowSize).join("\n"),
      });
      windows.set(key, existing);
    }
  }

  const evidence: EvidenceRecord[] = [];
  for (const [key, matches] of windows.entries()) {
    const uniqueFiles = new Set(matches.map((match) => match.file.path));
    if (uniqueFiles.size < 2) {
      continue;
    }
    const selected = firstMatchPerFile(matches).slice(0, 5);
    evidence.push(makeEvidence(context, {
      id: stableId("ev", `duplication:${key}`),
      adapter: "line-window-duplication",
      kind: "duplicate-cluster",
      title: `Repeated code block across ${uniqueFiles.size} files`,
      summary: `A repeated ${windowSize}-line normalized code block appears in ${uniqueFiles.size} files.`,
      files: selected.map((match) => ({
        path: match.file.path,
        startLine: match.startLine,
        endLine: match.startLine + windowSize - 1,
      })),
      data: {
        occurrences: matches.length,
        uniqueFiles: [...uniqueFiles],
        sample: selected[0]?.text ?? "",
      },
      confidence: uniqueFiles.size >= 3 ? "high" : "medium",
    }));
    if (evidence.length >= 25) {
      break;
    }
  }

  return { evidence, diagnostics: [] };
}

async function codeGraphAdapter(context: AdapterContext): Promise<AdapterResult> {
  const graph = buildLocalImportGraph(context.files.filter((file) => !isTestPath(file.path)));
  const nodes = [...graph.nodes.entries()].map(([filePath, node]) => ({
    path: filePath,
    directory: moduleDirectory(filePath),
    topLevel: filePath.split("/")[0] ?? ".",
    incoming: node.importedBy.size,
    outgoing: node.imports.size,
  }));
  const hotspots = [...nodes]
    .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing))
    .slice(0, 40);
  const directories = summarizeDirectories(nodes, graph.edges);
  const files = hotspots.slice(0, 12).map((node) => ({ path: node.path }));

  return {
    evidence: [makeEvidence(context, {
      id: stableId("ev", `code-graph:${graph.nodes.size}:${graph.edges.length}:${hotspots.map((node) => node.path).join("|")}`),
      adapter: "code-graph",
      kind: "code-graph-summary",
      title: "Local import graph summary",
      summary: `The local source graph contains ${graph.nodes.size} files and ${graph.edges.length} local import edges across ${directories.length} directories.`,
      files,
      data: {
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.length,
        hotspots,
        directories,
        edges: graph.edges.slice(0, 800),
        nodes: nodes.slice(0, 300),
      },
      confidence: graph.edges.length > 0 ? "high" : "low",
    })],
    diagnostics: [],
  };
}

async function importGraphAdapter(context: AdapterContext): Promise<AdapterResult> {
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

async function typescriptStructureAdapter(context: AdapterContext): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];

  const tsLikeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
  for (const file of context.files.filter((item) => tsLikeExtensions.has(item.extension))) {
    const shallowWrappers: Array<{ name: string; startLine: number; endLine: number }> = [];
    const sourceFile = ts.createSourceFile(
      file.path,
      file.text,
      ts.ScriptTarget.Latest,
      true,
      file.extension.includes("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    visitNode(sourceFile, (node) => {
      if (
        !(
          ts.isFunctionDeclaration(node)
          || ts.isMethodDeclaration(node)
          || ts.isFunctionExpression(node)
          || ts.isArrowFunction(node)
        )
        || !node.body
      ) {
        return;
      }
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.end);
      const span = end.line - start.line + 1;
      const name = functionName(node) ?? "anonymous function";

      if (span >= 70) {
        evidence.push(makeEvidence(context, {
          id: stableId("ev", `ts-structure:function:${file.path}:${start.line}:${name}`),
          adapter: "typescript-structure",
          kind: "large-function",
          title: `Large function: ${name}`,
          summary: `${name} spans ${span} lines in ${file.path}.`,
          files: [{
            path: file.path,
            startLine: start.line + 1,
            endLine: end.line + 1,
          }],
          data: { name, lines: span },
          confidence: span >= 120 ? "high" : "medium",
        }));
      }

      const body = node.body;
      if (body && ts.isBlock(body) && body.statements.length === 1 && span <= 12) {
        const onlyStatement = body.statements[0];
        if (onlyStatement && ts.isReturnStatement(onlyStatement) && onlyStatement.expression) {
          shallowWrappers.push({
            name,
            startLine: start.line + 1,
            endLine: end.line + 1,
          });
        }
      }
    });

    if (shallowWrappers.length >= 5) {
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `ts-structure:wrapper-cluster:${file.path}:${shallowWrappers.length}`),
        adapter: "typescript-structure",
        kind: "shallow-wrapper-cluster",
        title: `Shallow wrapper cluster: ${file.path}`,
        summary: `${file.path} contains ${shallowWrappers.length} tiny wrappers that only return another expression.`,
        files: shallowWrappers.slice(0, 8).map((wrapper) => ({
          path: file.path,
          startLine: wrapper.startLine,
          endLine: wrapper.endLine,
        })),
        data: { wrappers: shallowWrappers },
        confidence: "medium",
      }));
    }
  }

  return { evidence: evidence.slice(0, 80), diagnostics: [] };
}

async function gitHistoryAdapter(context: AdapterContext): Promise<AdapterResult> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", context.root, "log", "--since=90 days ago", "--numstat", "--format=format:--commit--"],
      { maxBuffer: 1024 * 1024 * 10 },
    );
    const stats = new Map<string, { commits: number; changedLines: number }>();
    const seenInCommit = new Set<string>();

    for (const line of stdout.split(/\r?\n/)) {
      if (line === "--commit--") {
        for (const filePath of seenInCommit) {
          const current = stats.get(filePath) ?? { commits: 0, changedLines: 0 };
          current.commits += 1;
          stats.set(filePath, current);
        }
        seenInCommit.clear();
        continue;
      }

      const parts = line.split("\t");
      if (parts.length < 3) {
        continue;
      }
      const [addedRaw, removedRaw, filePathRaw] = parts;
      if (!addedRaw || !removedRaw || !filePathRaw) {
        continue;
      }
      const filePath = normalizePath(filePathRaw);
      if (!context.files.some((file) => file.path === filePath)) {
        continue;
      }
      const added = Number.parseInt(addedRaw, 10) || 0;
      const removed = Number.parseInt(removedRaw, 10) || 0;
      const current = stats.get(filePath) ?? { commits: 0, changedLines: 0 };
      current.changedLines += added + removed;
      stats.set(filePath, current);
      seenInCommit.add(filePath);
    }

    const evidence: EvidenceRecord[] = [];
    for (const [filePath, stat] of stats.entries()) {
      if (stat.commits < 4 && stat.changedLines < 180) {
        continue;
      }
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `git-history:${filePath}:${stat.commits}:${stat.changedLines}`),
        adapter: "git-history",
        kind: "churn-hotspot",
        title: `High churn file: ${filePath}`,
        summary: `${filePath} changed in ${stat.commits} commits with ${stat.changedLines} changed lines over the last 90 days.`,
        files: [{ path: filePath }],
        data: stat,
        confidence: stat.commits >= 8 || stat.changedLines >= 400 ? "high" : "medium",
      }));
    }

    return { evidence, diagnostics: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git history is unavailable";
    const hasNoCommits = message.includes("does not have any commits yet");
    return {
      evidence: [],
      diagnostics: [{
        level: hasNoCommits ? "info" : "warning",
        code: "git_history_unavailable",
        message: hasNoCommits
          ? "Git history adapter skipped because this repository has no commits yet."
          : message,
        adapter: "git-history",
      }],
    };
  }
}

async function testDiscoveryAdapter(context: AdapterContext): Promise<AdapterResult> {
  const testFiles = context.files.filter((file) => isTestPath(file.path));
  const sourceFiles = context.files.filter((file) => !isTestPath(file.path));
  const testStems = new Set(testFiles.map((file) => stem(file.path)));
  const evidence: EvidenceRecord[] = [];

  for (const file of sourceFiles) {
    const nonBlank = file.lines.filter((line) => line.trim().length > 0).length;
    if (nonBlank < 90) {
      continue;
    }
    if (testStems.has(stem(file.path))) {
      continue;
    }
    evidence.push(makeEvidence(context, {
      id: stableId("ev", `test-discovery:${file.path}:${nonBlank}`),
      adapter: "test-discovery",
      kind: "test-gap",
      title: `No nearby test discovered: ${file.path}`,
      summary: `${file.path} has ${nonBlank} non-blank lines and no nearby test file discovered by naming convention.`,
      files: [{ path: file.path }],
      data: { nonBlankLines: nonBlank, discoveredTestFiles: testFiles.length },
      confidence: nonBlank >= 220 ? "medium" : "low",
    }));
  }

  return { evidence, diagnostics: [] };
}

function firstMatchPerFile(
  matches: Array<{ file: SourceFile; startLine: number; text: string }>,
): Array<{ file: SourceFile; startLine: number; text: string }> {
  const selected = new Map<string, { file: SourceFile; startLine: number; text: string }>();
  for (const match of matches) {
    if (!selected.has(match.file.path)) {
      selected.set(match.file.path, match);
    }
  }
  return [...selected.values()];
}

async function readFirstJsonReport(dir: string): Promise<Record<string, unknown>> {
  const files = await readdir(dir, { recursive: true });
  for (const file of files) {
    if (typeof file !== "string" || !file.endsWith(".json")) {
      continue;
    }
    const raw = await readFile(path.join(dir, file), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isObject(parsed)) {
      return parsed;
    }
  }
  return {};
}

function duplicateFiles(value: Record<string, unknown>, root: string): Array<{ path: string; startLine?: number; endLine?: number }> {
  const result: Array<{ path: string; startLine?: number; endLine?: number }> = [];
  for (const key of ["firstFile", "secondFile"]) {
    const file = value[key];
    if (!isObject(file) || typeof file["name"] !== "string") {
      continue;
    }
    const reference: { path: string; startLine?: number; endLine?: number } = {
      path: normalizePath(path.relative(root, file["name"])),
    };
    if (typeof file["start"] === "number") {
      reference.startLine = file["start"];
    }
    if (typeof file["end"] === "number") {
      reference.endLine = file["end"];
    }
    result.push(reference);
  }
  return result;
}

function sarifToolName(run: Record<string, unknown>): string {
  const tool = run["tool"];
  if (!isObject(tool)) {
    return "SARIF tool";
  }
  const driver = tool["driver"];
  if (!isObject(driver)) {
    return "SARIF tool";
  }
  return typeof driver["name"] === "string" ? driver["name"] : "SARIF tool";
}

function sarifTitle(result: Record<string, unknown>): string {
  const message = result["message"];
  if (isObject(message) && typeof message["text"] === "string") {
    return message["text"].slice(0, 160);
  }
  if (typeof result["ruleId"] === "string") {
    return result["ruleId"];
  }
  return "External analyzer finding";
}

function sarifFiles(result: Record<string, unknown>): Array<{ path: string; startLine?: number; endLine?: number }> {
  const locations = Array.isArray(result["locations"]) ? result["locations"] : [];
  const files: Array<{ path: string; startLine?: number; endLine?: number }> = [];
  for (const location of locations.slice(0, 5)) {
    if (!isObject(location)) {
      continue;
    }
    const physical = location["physicalLocation"];
    if (!isObject(physical)) {
      continue;
    }
    const artifact = physical["artifactLocation"];
    if (!isObject(artifact) || typeof artifact["uri"] !== "string") {
      continue;
    }
    const region = physical["region"];
    const reference: { path: string; startLine?: number; endLine?: number } = {
      path: normalizePath(decodeURIComponent(artifact["uri"])),
    };
    if (isObject(region) && typeof region["startLine"] === "number") {
      reference.startLine = region["startLine"];
    }
    if (isObject(region) && typeof region["endLine"] === "number") {
      reference.endLine = region["endLine"];
    }
    files.push(reference);
  }
  return files;
}

function sarifConfidence(result: Record<string, unknown>): EvidenceRecord["confidence"] {
  const level = result["level"];
  if (level === "error") {
    return "high";
  }
  if (level === "warning") {
    return "medium";
  }
  return "low";
}

function compactObject(value: Record<string, unknown>, omitKeys: string[]): Record<string, unknown> {
  const omitted = new Set(omitKeys);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!omitted.has(key)) {
      result[key] = item;
    }
  }
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface ImportGraphNode {
  imports: Set<string>;
  importedBy: Set<string>;
}

function buildLocalImportGraph(files: SourceFile[]): {
  nodes: Map<string, ImportGraphNode>;
  edges: Array<{ from: string; to: string }>;
} {
  const sourcePaths = new Set(files.map((file) => file.path));
  const nodes = new Map<string, ImportGraphNode>();
  const edges: Array<{ from: string; to: string }> = [];

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

  edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
  return { nodes, edges };
}

function summarizeDirectories(
  nodes: Array<{ path: string; directory: string; incoming: number; outgoing: number }>,
  edges: Array<{ from: string; to: string }>,
): Array<{ path: string; fileCount: number; internalEdges: number; incomingEdges: number; outgoingEdges: number }> {
  const summaries = new Map<string, { path: string; fileCount: number; internalEdges: number; incomingEdges: number; outgoingEdges: number }>();
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

function moduleDirectory(filePath: string): string {
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

function collectImports(file: SourceFile): string[] {
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

function resolveImportPath(
  fromPath: string,
  specifier: string,
  sourcePaths: Set<string>,
): string | undefined {
  const base = specifier.startsWith(".")
    ? normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier)))
    : specifier.startsWith("@/")
      ? aliasImportBase(fromPath, specifier)
    : normalizePath(specifier.replace(/\./g, "/"));
  const candidates = importPathCandidates(base);
  return candidates.find((candidate) => sourcePaths.has(candidate));
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

function functionName(node: ts.FunctionLikeDeclaration): string | undefined {
  if ("name" in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return undefined;
}

function stem(filePath: string): string {
  return filePath
    .replace(/(^|\/)(__tests__|test|tests|spec)\//g, "$1")
    .replace(/\.(test|spec)\.[cm]?[jt]sx?$/, "")
    .replace(/(^|\/)test_([^/]+)\.py$/, "$1$2")
    .replace(/_(test|tests)\.py$/, "")
    .replace(/\.py$/, "")
    .replace(/\.[cm]?[jt]sx?$/, "")
    .replace(/\/index$/, "");
}
