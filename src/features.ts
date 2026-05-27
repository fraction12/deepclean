import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { defaultExcludeDirs } from "./defaults.js";
import { isTestPath, normalizePath, type SourceFile } from "./discovery.js";
import { stableId } from "./ids.js";
import { schemaVersion, type FeatureRecord, type FileReference } from "./types.js";
import { commandsForFiles, type VerificationProfile } from "./verification.js";

interface FeatureMapOptions {
  root: string;
  runId: string;
  createdAt: string;
  files: SourceFile[];
  verificationProfile: VerificationProfile;
  excludes?: string[];
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
      }));
    }
  }
  return features;
}

function sourceFeatures(options: FeatureMapOptions): FeatureRecord[] {
  const sourceFiles = options.files.filter((file) => !isTestPath(file.path));
  return sourceFiles.map((file) => {
    const kind = sourceFeatureKind(file);
    const tests = nearbyTests(file, options.files);
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
      contextFiles: tests,
      testFiles: tests,
      verification,
      tags: sourceTags(file, kind),
    });
  });
}

function testSuiteFeatures(options: FeatureMapOptions): FeatureRecord[] {
  const tests = options.files.filter((file) => isTestPath(file.path));
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
}): FeatureRecord {
  return {
    schemaVersion,
    recordType: "feature",
    featureId: stableId("feature", args.key),
    runId: args.options.runId,
    title: args.title,
    summary: args.summary,
    kind: args.kind,
    source: args.source,
    confidence: args.confidence,
    entrypoints: uniqueFileReferences(args.entrypoints),
    ownedFiles: uniqueFileReferences(args.ownedFiles),
    contextFiles: uniqueFileReferences(args.contextFiles),
    testFiles: uniqueFileReferences(args.testFiles),
    verification: uniqueStrings(args.verification).slice(0, 8),
    tags: uniqueStrings(args.tags),
    createdAt: args.options.createdAt,
    updatedAt: args.options.createdAt,
  };
}

function sourceFeatureKind(file: SourceFile): FeatureRecord["kind"] {
  if (file.extension === ".py") {
    return "python-module";
  }
  if (isRouteFile(file)) {
    return "route";
  }
  if (isComponentFile(file)) {
    return "component";
  }
  return "module";
}

function isRouteFile(file: SourceFile): boolean {
  return /(^|\/)(app|pages|routes)\//.test(file.path)
    || /\b(router|app)\.(get|post|put|patch|delete)\(/.test(file.text)
    || /\b(createBrowserRouter|createRoutesFromElements)\(/.test(file.text);
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
  if (file.text.includes("fetch(") || file.text.includes("axios.") || file.text.includes("requests.")) {
    tags.push("external-client");
  }
  if (file.text.includes("process.env") || file.text.includes("os.environ")) {
    tags.push("environment");
  }
  return tags;
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
    for (const entry of entries) {
      if (excludeSet.has(entry.name)) {
        continue;
      }
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || entry.name !== "package.json") {
        continue;
      }
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

  await walk(root);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function uniqueFileReferences(files: FileReference[]): FileReference[] {
  const seen = new Set<string>();
  const unique: FileReference[] = [];
  for (const file of files) {
    const key = `${file.path}:${file.startLine ?? ""}:${file.endLine ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(file);
  }
  return unique;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
