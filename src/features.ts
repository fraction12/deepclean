import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildLocalImportGraph } from "./architecture-graph.js";
import { defaultExcludeDirs } from "./defaults.js";
import { isTestPath, normalizePath, type SourceFile } from "./discovery.js";
import { uniqueFileReferences } from "./file-references.js";
import { stableId } from "./ids.js";
import {
  schemaVersion,
  type CandidateRecord,
  type EvidenceRecord,
  type FeatureRecord,
  type FileReference,
} from "./types.js";
import { commandsForFiles, type VerificationProfile } from "./verification.js";

interface FeatureMapOptions {
  root: string;
  runId: string;
  createdAt: string;
  files: SourceFile[];
  verificationProfile: VerificationProfile;
  excludes?: string[];
  mapSource?: FeatureRecord["mapSource"];
}

interface PackageJson {
  scripts?: Record<string, string>;
}

interface PackageRecord {
  path: string;
  scripts: Record<string, string>;
}

export async function mapSemanticFeatures(options: FeatureMapOptions): Promise<FeatureRecord[]> {
  const packages = await discoverPackages(options.root, options.excludes ?? defaultExcludeDirs);
  const features = [
    ...packageScriptFeatures(options, packages),
    ...sourceFeatures(options),
    ...testSuiteFeatures(options),
    ...configFeatures(options, packages),
  ];
  return dedupeFeatures(features).sort(compareFeatures);
}

export function attachFeatureContextToEvidence(
  evidence: EvidenceRecord[],
  features: FeatureRecord[],
): EvidenceRecord[] {
  const index = featureIndex(features);
  return evidence.map((record) => {
    const fileRoles = record.files.flatMap((file) => rolesForPath(index, file.path));
    return {
      ...record,
      affectedFeatureIds: uniqueStrings(fileRoles.map((role) => role.featureId)),
      fileRoles,
    };
  });
}

export function attachFeatureContextToCandidates(
  candidates: CandidateRecord[],
  features: FeatureRecord[] = [],
): CandidateRecord[] {
  const index = featureIndex(features);
  return candidates.map((candidate) => ({
    ...candidate,
    affectedFeatureIds: uniqueStrings([
      ...candidate.affectedFeatureIds,
      ...candidate.files.flatMap((file) => rolesForPath(index, file.path).map((role) => role.featureId)),
    ]),
    featureScope: candidateFeatureScope([
      ...candidate.affectedFeatureIds,
      ...candidate.files.flatMap((file) => rolesForPath(index, file.path).map((role) => role.featureId)),
    ], candidate.featureScope),
  }));
}

export function featuresForCandidate(
  candidate: CandidateRecord,
  features: FeatureRecord[],
): FeatureRecord[] {
  const ids = new Set(candidate.affectedFeatureIds);
  return features.filter((feature) => ids.has(feature.featureId));
}

function packageScriptFeatures(options: FeatureMapOptions, packages: PackageRecord[]): FeatureRecord[] {
  const features: FeatureRecord[] = [];
  for (const packageJson of packages) {
    for (const script of ["start", "build", "typecheck", "lint", "test", "test:run", "format"]) {
      if (!packageJson.scripts[script]) {
        continue;
      }
      const directory = path.posix.dirname(packageJson.path);
      const packageRoot = directory === "." ? "" : directory;
      const command = packageRoot ? `cd ${packageRoot} && npm run ${script}` : `npm run ${script}`;
      features.push(featureRecord({
        options,
        key: `package-script:${packageJson.path}:${script}`,
        title: `${packageRoot || "root"} ${script} script`,
        summary: `Package script \`${script}\` from ${packageJson.path}.`,
        kind: "package-script",
        source: "package-json",
        confidence: "high",
        entrypoints: [{ path: packageJson.path }],
        ownedFiles: [{ path: packageJson.path }],
        contextFiles: [],
        testFiles: script.includes("test") ? [{ path: packageJson.path }] : [],
        verification: [command],
        tags: ["package-script", `script:${script}`, packageRoot ? `package:${packageRoot}` : "package:root"],
        reasons: [`package.json script "${script}" is an executable repository entrypoint.`],
      }));
    }
  }
  return features;
}

function sourceFeatures(options: FeatureMapOptions): FeatureRecord[] {
  const sourceFiles = options.files.filter((file) => !isTestPath(file.path) && !isGeneratedPath(file.path));
  const graph = buildLocalImportGraph(sourceFiles);
  return sourceFiles.map((file) => {
    const kind = sourceFeatureKind(file);
    const tests = nearbyTests(file, options.files);
    const imports = graph.nodes.get(file.path)?.imports ?? new Set<string>();
    const contextFiles = uniqueFileReferences([
      ...[...imports].map((filePath) => ({ path: filePath })),
      ...tests,
    ]);
    const owned = [{ path: file.path, startLine: 1, endLine: Math.max(1, file.lines.length) }];
    const verification = commandsForFiles(options.verificationProfile, owned, tests.length > 0 ? ["npm test"] : []);
    const label = sourceFeatureTitle(file, kind);
    return featureRecord({
      options,
      key: `${kind}:${file.path}`,
      title: label,
      summary: sourceFeatureSummary(file, kind),
      kind,
      source: "local-source",
      confidence: kind === "route" || kind === "component" ? "high" : "medium",
      entrypoints: [{ path: file.path }],
      ownedFiles: owned,
      contextFiles,
      testFiles: tests,
      verification,
      tags: sourceTags(file, kind),
      reasons: sourceReasons(file, kind, tests, contextFiles),
    });
  });
}

function testSuiteFeatures(options: FeatureMapOptions): FeatureRecord[] {
  const tests = options.files.filter((file) => isTestPath(file.path) && !isGeneratedPath(file.path));
  return tests.map((file) => featureRecord({
    options,
    key: `test-suite:${file.path}`,
    title: `Test suite ${file.path}`,
    summary: `Behavior checks and regression coverage in ${file.path}.`,
    kind: "test-suite",
    source: "local-source",
    confidence: "high",
    entrypoints: [{ path: file.path }],
    ownedFiles: [{ path: file.path, startLine: 1, endLine: Math.max(1, file.lines.length) }],
    contextFiles: [],
    testFiles: [{ path: file.path }],
    verification: commandsForFiles(options.verificationProfile, [{ path: file.path }], ["npm test"]),
    tags: ["test-suite", languageTag(file)],
    reasons: ["test path matched Deepclean's deterministic test discovery rules."],
  }));
}

function configFeatures(options: FeatureMapOptions, packages: PackageRecord[]): FeatureRecord[] {
  const packagePaths = new Set(packages.map((record) => record.path));
  const configPaths = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vitest.config.ts",
    "next.config.js",
    "pyproject.toml",
    "requirements.txt",
    "Makefile",
  ].filter((filePath) => packagePaths.has(filePath) || options.files.some((file) => file.path === filePath));

  return configPaths.map((filePath) => featureRecord({
    options,
    key: `config:${filePath}`,
    title: `Project config ${filePath}`,
    summary: `Project configuration and tooling settings in ${filePath}.`,
    kind: "config",
    source: "local-config",
    confidence: "medium",
    entrypoints: [{ path: filePath }],
    ownedFiles: [{ path: filePath }],
    contextFiles: [],
    testFiles: [],
    verification: options.verificationProfile.defaultCommands,
    tags: ["config"],
    reasons: ["file is a recognized project configuration or package manifest entrypoint."],
  }));
}

function featureRecord(args: {
  options: FeatureMapOptions;
  key: string;
  title: string;
  summary: string;
  kind: FeatureRecord["kind"];
  source: string;
  confidence: FeatureRecord["confidence"];
  entrypoints: FileReference[];
  ownedFiles: FileReference[];
  contextFiles: FileReference[];
  testFiles: FileReference[];
  verification: string[];
  tags: string[];
  reasons: string[];
}): FeatureRecord {
  const fileRoles = deriveFeatureFileRoles({
    kind: args.kind,
    entrypoints: args.entrypoints,
    ownedFiles: args.ownedFiles,
    contextFiles: args.contextFiles,
    testFiles: args.testFiles,
  });
  return {
    schemaVersion,
    recordType: "feature",
    featureId: stableId("feature", args.key),
    runId: args.options.runId,
    title: args.title,
    summary: args.summary,
    kind: args.kind,
    source: args.source,
    mapSource: args.options.mapSource ?? "heuristic",
    mapperVersion: "local-v1",
    confidence: args.confidence,
    entrypoints: uniqueFileReferences(args.entrypoints),
    ownedFiles: uniqueFileReferences(args.ownedFiles),
    contextFiles: uniqueFileReferences(args.contextFiles),
    testFiles: uniqueFileReferences(args.testFiles),
    fileRoles,
    reasons: uniqueStrings(args.reasons).slice(0, 8),
    verification: uniqueStrings(args.verification).slice(0, 8),
    tags: uniqueStrings(args.tags),
    createdAt: args.options.createdAt,
    updatedAt: args.options.createdAt,
  };
}

function sourceFeatureKind(file: SourceFile): FeatureRecord["kind"] {
  if (/(^|\/)(app|pages|routes)\//.test(file.path)
    || /(^|\/)(api|views|routers?)\//.test(file.path)
    || /\b(router|app)\.(get|post|put|patch|delete)\(/.test(file.text)
    || /@(router|app)\.(get|post|put|patch|delete)\b/.test(file.text)
    || /\b(APIRouter|FastAPI)\(/.test(file.text)
    || /\b(createBrowserRouter|createRoutesFromElements)\(/.test(file.text)) {
    return "route";
  }
  if (isComponentFile(file)) {
    return "component";
  }
  if (file.extension === ".py") {
    return "python-module";
  }
  return "module";
}

function isComponentFile(file: SourceFile): boolean {
  if (![".tsx", ".jsx"].includes(file.extension)) {
    return false;
  }
  return /<[A-Z][A-Za-z0-9]*/.test(file.text)
    || /export\s+(default\s+)?function\s+[A-Z]/.test(file.text)
    || /const\s+[A-Z][A-Za-z0-9]*\s*=\s*\(/.test(file.text);
}

function sourceFeatureTitle(file: SourceFile, kind: FeatureRecord["kind"]): string {
  if (kind === "route") {
    return `Route ${file.path}`;
  }
  if (kind === "component") {
    return `Component ${path.posix.basename(file.path)}`;
  }
  if (kind === "python-module") {
    return `Python module ${file.path}`;
  }
  return `Module ${file.path}`;
}

function sourceFeatureSummary(file: SourceFile, kind: FeatureRecord["kind"]): string {
  if (kind === "route") {
    return `Request or UI route entrypoint backed by ${file.path}.`;
  }
  if (kind === "component") {
    return `User interface component implemented in ${file.path}.`;
  }
  if (kind === "python-module") {
    return `Python behavior module implemented in ${file.path}.`;
  }
  return `Source module implemented in ${file.path}.`;
}

function sourceTags(file: SourceFile, kind: FeatureRecord["kind"]): string[] {
  const tags = [kind, languageTag(file), `area:${areaTag(file.path)}`];
  if (/(^|\/)(services?|service)\//.test(file.path)) {
    tags.push("service");
  }
  if (/(^|\/)(jobs?|workers?|queues?)\//.test(file.path) || /\b(worker|job|queue)\b/i.test(file.path)) {
    tags.push("job-worker");
  }
  if (file.text.includes("fetch(") || file.text.includes("axios.") || file.text.includes("requests.")) {
    tags.push("external-client");
  }
  if (file.text.includes("process.env") || file.text.includes("os.environ")) {
    tags.push("environment");
  }
  return tags;
}

function sourceReasons(
  file: SourceFile,
  kind: FeatureRecord["kind"],
  tests: FileReference[],
  contextFiles: FileReference[],
): string[] {
  const reasons = [`${file.path} matched deterministic ${kind} discovery.`];
  if (kind === "route") {
    reasons.push("file path or source text indicates a route entrypoint.");
  }
  if (kind === "component") {
    reasons.push("file extension and JSX/component exports indicate a UI component.");
  }
  if (tests.length > 0) {
    reasons.push("nearby tests were matched by source basename or directory.");
  }
  if (contextFiles.some((contextFile) => !tests.some((testFile) => testFile.path === contextFile.path))) {
    reasons.push("local imports were resolved into context files.");
  }
  if (/(^|\/)(services?|service)\//.test(file.path)) {
    reasons.push("path indicates service-layer ownership.");
  }
  if (/(^|\/)(jobs?|workers?|queues?)\//.test(file.path) || /\b(worker|job|queue)\b/i.test(file.path)) {
    reasons.push("path indicates job or worker ownership.");
  }
  return reasons;
}

function isGeneratedPath(filePath: string): boolean {
  return /(^|\/)(generated|__generated__|gen|vendor|dist|build|coverage)\//.test(filePath)
    || /\.generated\.[^.]+$/.test(filePath)
    || /\.gen\.[^.]+$/.test(filePath);
}

function languageTag(file: SourceFile): string {
  if (file.extension === ".py") {
    return "python";
  }
  if ([".ts", ".tsx", ".mts", ".cts"].includes(file.extension)) {
    return "typescript";
  }
  return "javascript";
}

function areaTag(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length > 1 ? parts[0] ?? "." : ".";
}

function nearbyTests(file: SourceFile, files: SourceFile[]): FileReference[] {
  const sourceBase = path.posix.basename(file.path).replace(/\.[^.]+$/, "");
  const sourceDir = path.posix.dirname(file.path);
  return files
    .filter((candidate) => isTestPath(candidate.path))
    .filter((candidate) => {
      const testBase = path.posix.basename(candidate.path);
      return candidate.path.startsWith(`${sourceDir}/`)
        || testBase.includes(sourceBase)
        || candidate.path.includes(`/${sourceBase}.`);
    })
    .slice(0, 8)
    .map((candidate) => ({ path: candidate.path }));
}

async function discoverPackages(root: string, excludes: string[]): Promise<PackageRecord[]> {
  const records: PackageRecord[] = [];
  const excludeSet = new Set(excludes);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.filter((candidate) => !excludeSet.has(candidate.name))) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && entry.name === "package.json") {
        try {
          const parsed = JSON.parse(await readFile(absolutePath, "utf8")) as PackageJson;
          const scripts = parsed.scripts ?? {};
          records.push({
            path: normalizePath(path.relative(root, absolutePath)),
            scripts,
          });
        } catch {
          // Ignore malformed package manifests here; config validation is handled elsewhere.
        }
      }
    }
  }

  await walk(root);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function deriveFeatureFileRoles(args: {
  kind: FeatureRecord["kind"];
  entrypoints: FileReference[];
  ownedFiles: FileReference[];
  contextFiles: FileReference[];
  testFiles: FileReference[];
}): FeatureRecord["fileRoles"] {
  const roles = new Map<string, FeatureRecord["fileRoles"][number]["role"]>();
  for (const file of args.contextFiles) {
    roles.set(file.path, "context");
  }
  for (const file of args.ownedFiles) {
    roles.set(file.path, args.kind === "config" ? "config" : "owned");
  }
  for (const file of args.entrypoints) {
    roles.set(file.path, args.kind === "config" ? "config" : "entrypoint");
  }
  for (const file of args.testFiles) {
    roles.set(file.path, "test");
  }
  return [...roles.entries()]
    .map(([filePath, role]) => ({ path: filePath, role }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.role.localeCompare(b.role));
}

function featureIndex(features: FeatureRecord[]): Map<string, Array<{
  featureId: string;
  role: FeatureRecord["fileRoles"][number]["role"];
}>> {
  const index = new Map<string, Array<{
    featureId: string;
    role: FeatureRecord["fileRoles"][number]["role"];
  }>>();
  for (const feature of features) {
    for (const role of feature.fileRoles) {
      const current = index.get(role.path) ?? [];
      current.push({ featureId: feature.featureId, role: role.role });
      index.set(role.path, current);
    }
  }
  for (const [filePath, roles] of index.entries()) {
    const featureIds = new Set(roles.map((role) => role.featureId));
    if (featureIds.size <= 1) {
      continue;
    }
    index.set(filePath, roles.map((role) => (
      role.role === "owned" || role.role === "entrypoint"
        ? { ...role, role: "shared" as const }
        : role
    )));
  }
  return index;
}

function rolesForPath(
  index: Map<string, Array<{ featureId: string; role: FeatureRecord["fileRoles"][number]["role"] }>>,
  filePath: string,
): Array<{ path: string; featureId: string; role: FeatureRecord["fileRoles"][number]["role"] }> {
  return (index.get(filePath) ?? [])
    .map((role) => ({ path: filePath, ...role }))
    .sort((a, b) => a.featureId.localeCompare(b.featureId) || a.role.localeCompare(b.role));
}

function candidateFeatureScope(
  featureIds: string[],
  existing: CandidateRecord["featureScope"] | undefined,
): CandidateRecord["featureScope"] {
  const uniqueFeatureIds = uniqueStrings(featureIds);
  if (uniqueFeatureIds.length === 0) {
    return existing ?? "unmapped";
  }
  if (uniqueFeatureIds.length === 1) {
    if (existing === "shared-context") {
      return "shared-context";
    }
    return "feature-local";
  }
  return "cross-feature";
}

function dedupeFeatures(features: FeatureRecord[]): FeatureRecord[] {
  const byId = new Map<string, FeatureRecord>();
  for (const feature of features) {
    byId.set(feature.featureId, feature);
  }
  return [...byId.values()];
}

function compareFeatures(left: FeatureRecord, right: FeatureRecord): number {
  return left.kind.localeCompare(right.kind)
    || left.title.localeCompare(right.title)
    || left.featureId.localeCompare(right.featureId);
}
