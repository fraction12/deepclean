import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { schemaVersion } from "./defaults.js";
import type { AnalyzerSetupPlanRecord, Diagnostic } from "./types.js";

export async function buildAnalyzerSetupPlan(options: {
  id: string;
  root: string;
  createdAt?: string | undefined;
}): Promise<AnalyzerSetupPlanRecord> {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const packageJson = await readPackageJson(options.root);
  const scripts = packageJson?.scripts ?? {};
  const packageManager = await detectPackageManager(options.root);
  const ciFiles = await detectCiFiles(options.root);
  const ecosystem = packageJson ? "javascript-typescript" : "unknown";
  const diagnostics: Diagnostic[] = [];
  if (!packageJson) {
    diagnostics.push({
      level: "info",
      code: "analyzer_setup_no_package_json",
      message: "No package.json found; only Deepclean built-in evidence is available by default.",
    });
  }

  return {
    schemaVersion,
    recordType: "analyzer_setup_plan",
    id: options.id,
    root: options.root,
    ecosystem,
    ...(packageManager ? { packageManager } : {}),
    existingScripts: scripts,
    ciFiles,
    configuredAnalyzers: configuredAnalyzersFromScripts(scripts),
    recommendations: recommendationsForScripts(scripts, packageManager),
    coverageStatus: [
      {
        family: "maintainability",
        status: "covered",
        evidenceClass: "built-in",
        analyzerIds: ["deepclean"],
        summary: "Deepclean built-in scan covers maintainability without external setup.",
      },
      {
        family: "security",
        status: hasScript(scripts, /semgrep|codeql|security/i) ? "covered" : "not-configured",
        evidenceClass: hasScript(scripts, /semgrep|codeql|security/i) ? "configured-analyzer" : "recommended-analyzer",
        analyzerIds: hasScript(scripts, /semgrep/i) ? ["semgrep"] : ["semgrep", "codeql"],
        summary: hasScript(scripts, /semgrep|codeql|security/i)
          ? "Security scanner script appears configured."
          : "Security assurance can be strengthened with Semgrep or CodeQL.",
      },
      {
        family: "dependency-risk",
        status: packageJson ? "partial" : "not-configured",
        evidenceClass: packageJson ? "recommended-analyzer" : "built-in",
        analyzerIds: packageJson ? [`${packageManager ?? "npm"}-audit`] : [],
        summary: packageJson
          ? "Dependency audit is recommended as an optional gate."
          : "No package manifest found for dependency audit detection.",
      },
    ],
    dryRun: true,
    diagnostics,
    createdAt,
  };
}

async function readPackageJson(root: string): Promise<{ scripts?: Record<string, string> } | undefined> {
  try {
    const raw = await readFile(path.join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    return {
      scripts: isStringRecord(parsed.scripts) ? parsed.scripts : {},
    };
  } catch {
    return undefined;
  }
}

async function detectPackageManager(root: string): Promise<string | undefined> {
  for (const [file, manager] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ] as const) {
    try {
      await readFile(path.join(root, file), "utf8");
      return manager;
    } catch {
      // try next lockfile
    }
  }
  return undefined;
}

async function detectCiFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  try {
    for (const file of await readdir(path.join(root, ".github", "workflows"))) {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        files.push(`.github/workflows/${file}`);
      }
    }
  } catch {
    // no GitHub workflow directory
  }
  return files.sort();
}

function configuredAnalyzersFromScripts(scripts: Record<string, string>): AnalyzerSetupPlanRecord["configuredAnalyzers"] {
  const analyzers: AnalyzerSetupPlanRecord["configuredAnalyzers"] = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (/semgrep/i.test(command)) {
      analyzers.push({ id: "semgrep", family: "security", evidenceClass: "configured-analyzer", command: scriptCommand(name), required: false, notes: [] });
    }
    if (/jscpd|duplication/i.test(command)) {
      analyzers.push({ id: "duplication", family: "duplication", evidenceClass: "configured-analyzer", command: scriptCommand(name), required: false, notes: [] });
    }
    if (/coverage/i.test(name) || /coverage/i.test(command)) {
      analyzers.push({ id: "coverage", family: "test-proof", evidenceClass: "configured-analyzer", command: scriptCommand(name), required: false, notes: [] });
    }
  }
  return analyzers;
}

function recommendationsForScripts(
  scripts: Record<string, string>,
  packageManager: string | undefined,
): AnalyzerSetupPlanRecord["recommendations"] {
  const recommendations: AnalyzerSetupPlanRecord["recommendations"] = [];
  if (scripts["typecheck"]) {
    recommendations.push(recommendation("typecheck", "bug-risk", scriptCommand("typecheck"), "Use the existing typecheck script as a correctness signal.", true, false));
  }
  if (scripts["test"]) {
    recommendations.push(recommendation("test", "test-proof", scriptCommand("test"), "Use the existing test script as a proof signal.", true, false));
  }
  if (!hasScript(scripts, /audit/i) && packageManager) {
    recommendations.push(recommendation(`${packageManager}-audit`, "dependency-risk", `${packageManager} audit --json`, "Add dependency audit output as optional dependency-risk evidence.", true, false));
  }
  if (!hasScript(scripts, /semgrep/i)) {
    recommendations.push(recommendation("semgrep", "security", "npx semgrep scan --sarif --output .deepclean/quality/setup/semgrep.sarif", "Add Semgrep SARIF as optional security/correctness evidence.", false, true));
  }
  if (hasScript(scripts, /coverage/i)) {
    recommendations.push(recommendation("coverage", "test-proof", scriptCommand(Object.keys(scripts).find((name) => /coverage/i.test(name)) ?? "test"), "Use existing coverage tooling as optional test-proof evidence.", true, false));
  }
  return recommendations;
}

function recommendation(
  analyzerId: string,
  family: AnalyzerSetupPlanRecord["recommendations"][number]["family"],
  command: string,
  rationale: string,
  immediatelyRunnable: boolean,
  requiresInstall: boolean,
): AnalyzerSetupPlanRecord["recommendations"][number] {
  return {
    analyzerId,
    family,
    evidenceClass: "recommended-analyzer",
    title: `Configure ${analyzerId}`,
    command,
    outputPath: `.deepclean/quality/setup/${analyzerId}.json`,
    filesToChange: [],
    immediatelyRunnable,
    requiresInstall,
    advisory: true,
    rationale,
  };
}

function scriptCommand(name: string): string {
  return `npm run ${name}`;
}

function hasScript(scripts: Record<string, string>, pattern: RegExp): boolean {
  return Object.entries(scripts).some(([name, command]) => pattern.test(name) || pattern.test(command));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object"
    && value !== null
    && Object.values(value).every((item) => typeof item === "string");
}
