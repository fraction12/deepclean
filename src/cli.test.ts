import { chmod, mkdtemp, readFile, readdir, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { buildLocalImportGraph } from "./architecture-graph.js";
import { candidatesFromEvidence } from "./candidates.js";
import { main } from "./cli.js";
import type { SourceFile } from "./discovery.js";
import { lockRecordSchema, readLockStatuses, withStateWriteLock, type LockRecord } from "./locks.js";
import { buildCandidatePlan } from "./plans.js";
import { buildReportRecord } from "./reporting.js";
import { classifyRevalidation } from "./revalidation.js";
import { resolveStatePaths } from "./state.js";
import {
  candidateObservationRecordSchema,
  candidateRecordSchema,
  analyzerSetupPlanRecordSchema,
  campaignSummaryRecordSchema,
  ciRunRecordSchema,
  featureRecordSchema,
  findingRecordSchema,
  fixAttemptRecordSchema,
  identityMatchRecordSchema,
  lifecycleEventRecordSchema,
  retentionManifestRecordSchema,
  revalidationRecordSchema,
  schemaVersion,
  prOpportunityRecordSchema,
  qualityGateResultRecordSchema,
  qualityProfileRecordSchema,
  synthesisAttemptRecordSchema,
  type CandidateRecord,
  type EvidenceRecord,
  type FeatureRecord,
  type FindingRecord,
} from "./types.js";

const execFileAsync = promisify(execFile);

describe("deepclean cli", registerCliSmokeTests);

function registerCliSmokeTests(): void {
  test("initializes state and emits JSON", async () => {
    await withTempRepo(async (repo) => {
      const payload = await runJsonCli<{ ok: boolean; data: { stateDir: string } }>(["init", "--json"], repo);
      expect(payload.ok).toBe(true);
      expect(payload.data.stateDir.endsWith(".deepclean")).toBe(true);
    });
  });

  test("initializes operating-loop state directories", async () => {
    await withTempRepo(async (repo) => {
      await runJsonCli(["init", "--json"], repo);
      await expectDeepcleanStateDirectories(repo);
    });
  });

  test("parses cleanup campaign controller record contracts", () => {
    const createdAt = "2026-06-01T00:00:00.000Z";
    const opportunity = prOpportunityRecordSchema.parse({
      schemaVersion,
      recordType: "pr_opportunity",
      id: "opportunity-001",
      runId: "run-001",
      targetCandidateIds: ["candidate-001"],
      targetFindingIds: ["finding-001"],
      targetClusterIds: [],
      classification: "safe-narrow-pr",
      status: "recommended",
      title: "Extract focused quality gate records",
      oneSentenceChange: "Add durable quality gate contracts without changing CI behavior.",
      rationale: "Later command slices need stable records first.",
      score: 92,
      confidence: "high",
      risk: "safe",
      ownedFiles: [{ path: "src/quality-types.ts" }],
      contextFiles: [{ path: "src/types.ts" }],
      doNotTouch: ["src/cli.ts"],
      behaviorInvariants: ["Existing ci flags keep current behavior."],
      validationPlan: ["npm run typecheck"],
      testsRequiredFirst: false,
      expectedReviewerConcern: "schema shape",
      stopLine: "Do not wire command behavior in this slice.",
      expectedPayoff: "Unblocks the next implementation slices.",
      sourceSignals: [{ kind: "spec", id: "code-quality-gates", summary: "OpenSpec requires durable records." }],
      diagnostics: [],
      createdAt,
      updatedAt: createdAt,
    });
    expect(opportunity.classification).toBe("safe-narrow-pr");

    const campaign = campaignSummaryRecordSchema.parse({
      schemaVersion,
      recordType: "campaign_summary",
      id: "campaign-001",
      runId: "run-001",
      currentRunId: "run-001",
      opportunityRunId: "run-001",
      recommendedOpportunityId: "opportunity-001",
      counts: {
        byClassification: { "safe-narrow-pr": 1 },
        byStatus: { recommended: 1 },
      },
      completedOpportunityIds: [],
      supersededOpportunityIds: [],
      knownFixAttemptIds: [],
      knownPrUrls: [],
      improvements: [],
      remainingDebt: [],
      diagnostics: [],
      createdAt,
    });
    expect(campaign.recommendedOpportunityId).toBe("opportunity-001");

    const profile = qualityProfileRecordSchema.parse({
      schemaVersion,
      recordType: "quality_profile",
      id: "balanced",
      name: "Balanced",
      mode: "blocking",
      scope: "pr",
      gates: [{
        family: "maintainability",
        mode: "blocking",
        thresholds: { maxNewP1: 0 },
        requiredAnalyzerClasses: [],
        advisoryAnalyzerClasses: [],
      }],
      analyzerInputs: [],
      requiredAnalyzerClasses: [],
      recommendedAnalyzerClasses: ["semgrep"],
      createdAt,
      updatedAt: createdAt,
    });
    expect(profile.recommendedAnalyzerClasses).toEqual(["semgrep"]);

    const result = qualityGateResultRecordSchema.parse({
      schemaVersion,
      recordType: "quality_gate_result",
      id: "quality-001",
      runId: "run-001",
      profileId: "balanced",
      headRef: "HEAD",
      status: "advisory",
      blockers: [],
      advisories: [{
        id: "advisory-001",
        family: "security",
        title: "Security scanner not configured",
        severity: "advisory",
        baselineStatus: "unknown",
        evidenceIds: [],
        candidateIds: [],
        findingIds: [],
        opportunityIds: [],
        analyzerRuleIds: [],
        files: [],
        summary: "Specialized security assurance is missing.",
      }],
      regressions: [],
      improvements: [],
      analyzerProvenance: [{
        analyzerId: "semgrep",
        family: "security",
        evidenceClass: "recommended-analyzer",
        status: "not-configured",
        ruleIds: [],
        diagnosticIds: [],
      }],
      coverageStatus: [{
        family: "security",
        status: "not-configured",
        evidenceClass: "recommended-analyzer",
        analyzerIds: ["semgrep"],
        summary: "Semgrep is recommended but not configured.",
      }],
      artifactPaths: {},
      diagnostics: [],
      createdAt,
    });
    expect(result.coverageStatus[0]?.status).toBe("not-configured");

    const setup = analyzerSetupPlanRecordSchema.parse({
      schemaVersion,
      recordType: "analyzer_setup_plan",
      id: "analyzers-001",
      root: "/repo",
      ecosystem: "javascript-typescript",
      packageManager: "npm",
      existingScripts: { test: "vitest run" },
      ciFiles: [".github/workflows/ci.yml"],
      configuredAnalyzers: [],
      recommendations: [{
        analyzerId: "typecheck",
        family: "bug-risk",
        evidenceClass: "recommended-analyzer",
        title: "Run TypeScript typecheck",
        command: "npm run typecheck",
        outputPath: ".deepclean/quality/setup/typecheck.txt",
        filesToChange: [],
        immediatelyRunnable: true,
        requiresInstall: false,
        advisory: true,
        rationale: "The repo already has a typecheck script.",
      }],
      coverageStatus: [],
      dryRun: true,
      diagnostics: [],
      createdAt,
    });
    expect(setup.recommendations[0]?.immediatelyRunnable).toBe(true);
  });

  test("supports global flags before the command", async () => {
    await withTempRepo(async (repo) => {
      const payload = await runJsonCli<{ ok: boolean; data: { root: string } }>(["--root", repo, "init", "--json"], "/");
      expect(payload.ok).toBe(true);
      expect(payload.data.root).toBe(repo);
    });
  });

  test("setup analyzers writes a dry-run starter plan without mutating project files", async () => {
    await withTempRepo(async (repo) => {
      const packagePath = path.join(repo, "package.json");
      const packageJson = {
        scripts: {
          typecheck: "tsc --noEmit",
          test: "vitest run",
        },
      };
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
      await writeFile(path.join(repo, "package-lock.json"), "{}\n", "utf8");
      await mkdir(path.join(repo, ".github", "workflows"), { recursive: true });
      await writeFile(path.join(repo, ".github", "workflows", "ci.yml"), "name: ci\n", "utf8");
      const before = await readFile(packagePath, "utf8");

      const result = await runCli(["setup", "analyzers", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          plan: {
            dryRun: boolean;
            ecosystem: string;
            packageManager?: string;
            existingScripts: Record<string, string>;
            ciFiles: string[];
            recommendations: Array<{ analyzerId: string; immediatelyRunnable: boolean; requiresInstall: boolean }>;
          };
          planPath: string;
        };
      };
      expect(payload.data.plan.dryRun).toBe(true);
      expect(payload.data.plan.ecosystem).toBe("javascript-typescript");
      expect(payload.data.plan.packageManager).toBe("npm");
      expect(payload.data.plan.existingScripts["typecheck"]).toBe("tsc --noEmit");
      expect(payload.data.plan.ciFiles).toContain(".github/workflows/ci.yml");
      expect(payload.data.plan.recommendations.some((item) => item.analyzerId === "typecheck" && item.immediatelyRunnable)).toBe(true);
      expect(payload.data.plan.recommendations.some((item) => item.analyzerId === "semgrep" && item.requiresInstall)).toBe(true);
      await expect(stat(payload.data.planPath)).resolves.toBeTruthy();
      expect(await readFile(packagePath, "utf8")).toBe(before);
    });
  });

  test("prints the package manifest version", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["--version"], repo);
      const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as { version: string };
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(packageJson.version);
    });
  });

  test("help includes the beta workflow examples", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["--help"], repo);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Examples:");
      expect(result.stdout).toContain("deepclean doctor");
      expect(result.stdout).toContain("deepclean scan");
      expect(result.stdout).toContain("deepclean status");
      expect(result.stdout).toContain("deepclean report");
      expect(result.stdout).toContain("deepclean review-pr --base origin/main --head HEAD --json --state-dir .octocheck/deepclean");
      expect(result.stdout).toContain("deepclean next --json");
      expect(result.stdout).toContain("deepclean show <candidate-id>");
      expect(result.stdout).toContain("deepclean plan <candidate-id>");
      expect(result.stdout).toContain("deepclean handoff <candidate-id> --format codex");
      expect(result.stdout).toContain("deepclean revalidate <candidate-id>");
      expect(result.stdout).toContain("deepclean fix <candidate-id> --mode guarded --patch ./fix.patch --dry-run --json");
    });
  });

  test("shared architecture graph resolves local TS and Python imports", () => {
    const graph = buildLocalImportGraph([
      sourceFile("src/main.ts", "import { helper } from './helper.js';\nvoid helper;\n"),
      sourceFile("src/helper.ts", "export const helper = 1;\n"),
      sourceFile("pkg/service.py", "from .models import Thing\n"),
      sourceFile("pkg/models.py", "class Thing: pass\n"),
    ]);

    expect(graph.nodes.get("src/main.ts")?.imports.has("src/helper.ts")).toBe(true);
    expect(graph.nodes.get("pkg/service.py")?.imports.has("pkg/models.py")).toBe(true);
  });

  test("scan emits architecture policy violations and dependency cycles", async () => {
    await withTempRepo(async (repo) => {
      await mkdir(path.join(repo, "src", "ui"), { recursive: true });
      await mkdir(path.join(repo, "src", "domain"), { recursive: true });
      await writeFile(path.join(repo, "src", "ui", "view.ts"), "import { model } from '../domain/model.js';\nexport const view = model;\n", "utf8");
      await writeFile(path.join(repo, "src", "domain", "model.ts"), "import { view } from '../ui/view.js';\nexport const model = String(view);\n", "utf8");
      await runCli(["init", "--json"], repo);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        architecture?: {
          layers?: Array<{ name: string; pathPatterns: string[] }>;
          rules?: Array<{ from: string; allow: string[] }>;
        };
      };
      config.architecture = {
        ...config.architecture,
        layers: [
          { name: "ui", pathPatterns: ["src/ui/**"] },
          { name: "domain", pathPatterns: ["src/domain/**"] },
        ],
        rules: [
          { from: "ui", allow: ["ui", "domain"] },
          { from: "domain", allow: ["domain"] },
        ],
      };
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { runId: string; candidates: Array<{ title: string; readiness?: string }> };
      };
      const evidence = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "evidence", `${payload.data.runId}.json`), "utf8"),
      ) as Array<{ kind: string; data: Record<string, unknown> }>;
      const summary = evidence.find((record) => record.kind === "code-graph-summary");
      expect(summary?.data["cycleCount"]).toBeGreaterThan(0);
      expect(summary?.data["policyViolationCount"]).toBeGreaterThan(0);
      expect(evidence.some((record) => record.kind === "dependency-cycle")).toBe(true);
      expect(evidence.some((record) => record.kind === "architecture-boundary-violation")).toBe(true);
      expect(payload.data.candidates.some((candidate) => candidate.title.includes("Dependency cycle"))).toBe(true);
      expect(payload.data.candidates.some((candidate) => candidate.title.includes("Architecture boundary violation"))).toBe(true);
    });
  });
}

describe("deepclean cli", () => {
  test("doctor reports an uninitialized clean directory without mutating state", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["doctor", "--no-update-check", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { initialized: boolean; config: { valid: boolean }; state: { valid: boolean } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.initialized).toBe(false);
      expect(payload.data.config.valid).toBe(false);
      expect(payload.data.state.valid).toBe(false);
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "config_missing")).toBe(true);
      await expect(stat(path.join(repo, ".deepclean"))).rejects.toThrow();
    });
  });

  test("doctor reports initialized state and provider readiness", async () => {
    await withTempRepo(async (repo) => {
      await runCli(["init", "--json"], repo);
      const result = await runCli(["doctor", "--no-update-check", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          initialized: boolean;
          config: { valid: boolean };
          state: { valid: boolean; missingDirs: string[] };
          provider: { command?: string; available: boolean };
          privacy?: { allowSourceInModel: boolean };
        };
      };
      expect(payload.data.initialized).toBe(true);
      expect(payload.data.config.valid).toBe(true);
      expect(payload.data.state.valid).toBe(true);
      expect(payload.data.state.missingDirs).toEqual([]);
      expect(payload.data.provider.command).toBeTruthy();
      expect(typeof payload.data.provider.available).toBe("boolean");
      expect(payload.data.privacy?.allowSourceInModel).toBe(false);
    });
  });

  test("doctor reports package update availability", async () => {
    await withEnv({ DEEPCLEAN_UPDATE_CHECK_LATEST_VERSION: "99.0.0-beta.0" }, async () => {
      await withTempRepo(async (repo) => {
        await runCli(["init", "--json"], repo);
        const result = await runCli(["doctor", "--json"], repo);
        expect(result.code).toBe(0);
        const payload = JSON.parse(result.stdout) as {
          data: {
            packageUpdate: {
              currentVersion: string;
              latestVersion?: string;
              stale: boolean;
              checked: boolean;
              updateCommand: string;
            };
          };
          diagnostics: Array<{ code: string }>;
        };
        expect(payload.data.packageUpdate.checked).toBe(true);
        expect(payload.data.packageUpdate.latestVersion).toBe("99.0.0-beta.0");
        expect(payload.data.packageUpdate.stale).toBe(true);
        expect(payload.data.packageUpdate.updateCommand).toBe("npm install -g @fraction12/deepclean");
        expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "package_update_available")).toBe(true);
      });
    });
  });

  test("doctor keeps beta as an explicit update-channel override", async () => {
    await withEnv({ DEEPCLEAN_UPDATE_CHECK_LATEST_VERSION: "99.0.0-beta.0" }, async () => {
      await withTempRepo(async (repo) => {
        const result = await runCli(["doctor", "--update-channel", "beta", "--json"], repo);
        expect(result.code).toBe(0);
        const payload = JSON.parse(result.stdout) as {
          data: { packageUpdate: { channel: string; updateCommand: string } };
        };
        expect(payload.data.packageUpdate.channel).toBe("beta");
        expect(payload.data.packageUpdate.updateCommand).toBe("npm install -g @fraction12/deepclean@beta");
      });
    });
  });

  test("doctor reports current package when release channel matches installed version", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as { version: string };
    await withEnv({ DEEPCLEAN_UPDATE_CHECK_LATEST_VERSION: packageJson.version }, async () => {
      await withTempRepo(async (repo) => {
        const result = await runCli(["doctor", "--json"], repo);
        expect(result.code).toBe(0);
        const payload = JSON.parse(result.stdout) as {
          data: { packageUpdate: { latestVersion?: string; checked: boolean; stale: boolean } };
          diagnostics: Array<{ code: string }>;
        };
        expect(payload.data.packageUpdate.checked).toBe(true);
        expect(payload.data.packageUpdate.latestVersion).toBe(packageJson.version);
        expect(payload.data.packageUpdate.stale).toBe(false);
        expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "package_update_available")).toBe(false);
      });
    });
  });

  test("doctor skips package update checks in offline mode", async () => {
    await withEnv({ DEEPCLEAN_UPDATE_CHECK_LATEST_VERSION: "99.0.0-beta.0" }, async () => {
      await withTempRepo(async (repo) => {
        const result = await runCli(["doctor", "--offline", "--json"], repo);
        expectDoctorPackageUpdate(result, {
          checked: false,
          stale: false,
          skippedReason: "offline mode",
          diagnosticCode: "package_update_check_skipped",
        });
      });
    });
  });

  test("doctor keeps running when package update check fails", async () => {
    await withEnv({ DEEPCLEAN_UPDATE_CHECK_ERROR: "npm unavailable" }, async () => {
      await withTempRepo(async (repo) => {
        const result = await runCli(["doctor", "--json"], repo);
        expectDoctorPackageUpdate(result, {
          checked: false,
          stale: false,
          error: "npm unavailable",
          diagnosticCode: "package_update_check_failed",
        });
      });
    });
  });

  test("status summarizes latest state and dirty git state", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await runCli(["scan", "--evidence-only", "--json"], repo);
      await writeFile(path.join(repo, "dirty.ts"), "export const dirty = true;\n", "utf8");
      const result = await runCli(["status", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          initialized: boolean;
          latestRunId?: string;
          git: { available: boolean; dirty: boolean };
          queue: { open: number; total: number; evidence: number; themes: number; features: number };
          artifacts: Record<string, number>;
          progress: { net: string; runs: { latestRunId?: string; candidateCount?: number }; eventCount: number };
        };
      };
      expect(payload.data.initialized).toBe(true);
      expect(payload.data.latestRunId).toMatch(/^run-/);
      expect(payload.data.git.available).toBe(true);
      expect(payload.data.git.dirty).toBe(true);
      expect(payload.data.queue.open).toBeGreaterThan(0);
      expect(payload.data.queue.total).toBeGreaterThan(0);
      expect(payload.data.queue.evidence).toBeGreaterThan(0);
      expect(payload.data.queue.themes).toBeGreaterThan(0);
      expect(payload.data.queue.features).toBeGreaterThan(0);
      expect(payload.data.artifacts["runs"]).toBeGreaterThan(0);
      expect(payload.data.artifacts["candidates"]).toBeGreaterThan(0);
      expect(payload.data.artifacts["features"]).toBeGreaterThan(0);
      expect(payload.data.progress.net).toBe("neutral");
      expect(payload.data.progress.runs.latestRunId).toBe(payload.data.latestRunId);
      expect(payload.data.progress.runs.candidateCount).toBe(payload.data.queue.total);
      expect(payload.data.progress.eventCount).toBeGreaterThan(0);
    });
  });

  test("status is read-only before initialization", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["status", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { initialized: boolean; nextAction: { command: string }; queue: { total: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.initialized).toBe(false);
      expect(payload.data.queue.total).toBe(0);
      expect(payload.data.nextAction.command).toBe("deepclean init");
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "no_state")).toBe(true);
      await expect(stat(path.join(repo, ".deepclean"))).rejects.toThrow();
    });
  });

  test("status surfaces blocked work, stale artifacts, recent progress, and next action", async () => {
    await withTempRepo(async (repo) => {
      await prepareStatusWorkflowState(repo);
      await writeStaleStatusFixture(repo);

      const status = await runCli(["status", "--json"], repo);
      expectStatusWorkflowPayload(status);
    });
  });

  test("parses current alpha candidates without stable identity fields", () => {
    const now = "2026-05-24T00:00:00.000Z";
    const alphaCandidate = {
      schemaVersion,
      recordType: "candidate",
      id: "candidate-001",
      runId: "run-test",
      title: "Fixture candidate",
      category: "architecture",
      status: "open",
      priority: "P2",
      confidence: "medium",
      impact: "feature",
      effort: "medium",
      risk: "moderate",
      files: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
      evidenceIds: ["ev-test"],
      whyItMatters: "Fixture why.",
      likelyRootCause: "Fixture cause.",
      suggestedDirection: "Fixture direction.",
      verification: ["npm test"],
      provenance: { source: "local-evidence" },
      createdAt: now,
      updatedAt: now,
    };
    const parsed = candidateRecordSchema.parse(alphaCandidate);
    expect(parsed.findingId).toBeUndefined();
    expect(parsed.signature).toBeUndefined();
  });

  test("validates operating-loop foundation record schemas", () => {
    const now = "2026-05-24T00:00:00.000Z";
    const signature = findingSignatureFixture();

    validateFindingLifecycleRecordSchemas(now, signature);
    validateStateManagementRecordSchemas(now);
    validatePlanningRecordSchemas(now);
    validateFeatureAndSynthesisRecordSchemas(now);
  });

  test("reports and explicitly recovers stale writer locks", async () => {
    await withTempRepo(async (repo) => {
      await runCli(["init", "--json"], repo);
      await writeLockFixture(repo, {
        pid: 99999999,
        command: "scan",
        createdAt: "2000-01-01T00:00:00.000Z",
      });

      const status = await runCli(["status", "--stale-lock-ms", "1", "--json"], repo);
      expect(status.code).toBe(0);
      const statusPayload = JSON.parse(status.stdout) as {
        data: { locks: { active: number; stale: number; records: Array<{ recoveryCommand?: string }> } };
      };
      expect(statusPayload.data.locks.active).toBe(0);
      expect(statusPayload.data.locks.stale).toBe(1);
      expect(statusPayload.data.locks.records[0]?.recoveryCommand).toContain("deepclean unlock --stale");

      const doctor = await runCli(["doctor", "--stale-lock-ms", "1", "--no-update-check", "--json"], repo);
      const doctorPayload = JSON.parse(doctor.stdout) as { diagnostics: Array<{ code: string }> };
      expect(doctorPayload.diagnostics.some((diagnostic) => diagnostic.code === "stale_locks")).toBe(true);

      const unlock = await runCli(["unlock", "--stale", "--stale-lock-ms", "1", "--json"], repo);
      expect(unlock.code).toBe(0);
      const unlockPayload = JSON.parse(unlock.stdout) as { data: { removed: unknown[]; active: unknown[] } };
      expect(unlockPayload.data.removed.length).toBe(1);
      expect(unlockPayload.data.active).toEqual([]);

      const after = await runCli(["status", "--json"], repo);
      const afterPayload = JSON.parse(after.stdout) as { data: { locks: { active: number; stale: number } } };
      expect(afterPayload.data.locks.active).toBe(0);
      expect(afterPayload.data.locks.stale).toBe(0);
    });
  });

  test("refuses writes when an active writer lock exists", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["init", "--json"], repo);
      await writeLockFixture(repo, {
        pid: process.pid,
        command: "scan",
        createdAt: new Date().toISOString(),
      });

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(4);
      const payload = JSON.parse(result.stdout) as {
        ok: boolean;
        error: { code: string };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("lock_contention");
      expect(payload.diagnostics[0]?.code).toBe("lock_contention");
    });
  });

  test("doctor and status diagnose partial candidate writes without crashing", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      await writeFile(path.join(repo, ".deepclean", "candidates", await latestRunFile(repo)), "", "utf8");

      const status = await runCli(["status", "--json"], repo);
      expect(status.code).toBe(0);
      const statusPayload = JSON.parse(status.stdout) as {
        data: { stateIntegrity: { valid: boolean; partialRecords: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(statusPayload.data.stateIntegrity.valid).toBe(false);
      expect(statusPayload.data.stateIntegrity.partialRecords).toBeGreaterThanOrEqual(1);
      expect(statusPayload.diagnostics.some((diagnostic) => diagnostic.code === "partial_state_record")).toBe(true);

      const doctor = await runCli(["doctor", "--no-update-check", "--json"], repo);
      expect(doctor.code).toBe(0);
      const doctorPayload = JSON.parse(doctor.stdout) as {
        data: { state: { valid: boolean; integrity: { partialRecords: number } } };
        diagnostics: Array<{ code: string }>;
      };
      expect(doctorPayload.data.state.valid).toBe(false);
      expect(doctorPayload.data.state.integrity.partialRecords).toBeGreaterThanOrEqual(1);
      expect(doctorPayload.diagnostics.some((diagnostic) => diagnostic.code === "partial_state_record")).toBe(true);
    });
  });

  test("status reports duplicate candidate IDs as state corruption", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const candidatesPath = path.join(repo, ".deepclean", "candidates", await latestRunFile(repo));
      const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as CandidateRecord[];
      candidates.push({ ...candidates[0]! });
      await writeFile(candidatesPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");

      const result = await runCli(["status", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { stateIntegrity: { valid: boolean; duplicateIds: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.stateIntegrity.valid).toBe(false);
      expect(payload.data.stateIntegrity.duplicateIds).toBeGreaterThanOrEqual(1);
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "duplicate_state_id")).toBe(true);
    });
  });

  test("serializes concurrent state writers without leaving locks behind", async () => {
    await withTempRepo(async (repo) => {
      await runCli(["init", "--json"], repo);
      const paths = resolveStatePaths({ cwd: repo });
      let activeWriters = 0;
      let maxActiveWriters = 0;
      const writes: string[] = [];
      const writer = async (label: string) => withStateWriteLock(paths, {
        command: `test-${label}`,
        wait: true,
        timeoutMs: 5000,
      }, async () => {
        activeWriters += 1;
        maxActiveWriters = Math.max(maxActiveWriters, activeWriters);
        await sleep(50);
        writes.push(label);
        activeWriters -= 1;
      });

      await Promise.all([writer("a"), writer("b")]);
      expect(maxActiveWriters).toBe(1);
      expect(writes.sort()).toEqual(["a", "b"]);
      expect(await readLockStatuses(paths)).toEqual([]);
    });
  });

  test("prune dry-run and apply preserve config, latest artifacts, locks, and retained evidence", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const latestRun = (await latestRunFile(repo)).replace(/\.json$/, "");
      await writeOldRunArtifacts(repo);

      const dryRun = await runCli(["prune", "--keep-runs", "1", "--dry-run", "--json"], repo);
      expect(dryRun.code).toBe(0);
      const dryRunPayload = JSON.parse(dryRun.stdout) as {
        data: { manifest: { dryRun: boolean; deletePaths: string[]; retainedPaths: string[]; blockedPaths: Array<{ path: string; reason: string }> } };
      };
      expect(dryRunPayload.data.manifest.dryRun).toBe(true);
      expect(dryRunPayload.data.manifest.deletePaths).toEqual(expect.arrayContaining([
        ".deepclean/runs/run-20000101000000-old.json",
        ".deepclean/features/run-20000101000000-old.json",
        ".deepclean/evidence/run-20000101000000-old.json",
        ".deepclean/synthesis/run-20000101000000-old.json",
        ".deepclean/opportunities/run-20000101000000-old.json",
        ".deepclean/reports/report-old.json",
        ".deepclean/reports/report-old.md",
      ]));
      expect(dryRunPayload.data.manifest.retainedPaths).toContain(`.deepclean/evidence/${latestRun}.json`);
      expect(dryRunPayload.data.manifest.retainedPaths).toContain(`.deepclean/features/${latestRun}.json`);
      expect(dryRunPayload.data.manifest.blockedPaths.some((blocked) => blocked.path === ".deepclean/config.json")).toBe(true);
      expect(dryRunPayload.data.manifest.blockedPaths.some((blocked) => blocked.path === ".deepclean/locks/state-writer.json")).toBe(true);
      await expect(stat(path.join(repo, ".deepclean", "runs", "run-20000101000000-old.json"))).resolves.toBeTruthy();

      const apply = await runCli(["prune", "--keep-runs", "1", "--json"], repo);
      expect(apply.code).toBe(0);
      const applyPayload = JSON.parse(apply.stdout) as { data: { manifest: { dryRun: boolean; deletePaths: string[] } } };
      expect(applyPayload.data.manifest.dryRun).toBe(false);
      expect(applyPayload.data.manifest.deletePaths).toEqual(dryRunPayload.data.manifest.deletePaths);
      await expect(stat(path.join(repo, ".deepclean", "runs", "run-20000101000000-old.json"))).rejects.toThrow();
      await expect(stat(path.join(repo, ".deepclean", "config.json"))).resolves.toBeTruthy();
      await expect(stat(path.join(repo, ".deepclean", "evidence", `${latestRun}.json`))).resolves.toBeTruthy();
      await expect(stat(path.join(repo, ".deepclean", "features", `${latestRun}.json`))).resolves.toBeTruthy();
      await expect(stat(path.join(repo, ".deepclean", "synthesis", "run-20000101000000-old.json"))).rejects.toThrow();
      expect(await readLockStatuses(resolveStatePaths({ cwd: repo }))).toEqual([]);
    });
  });

  test("source-safe export omits source excerpts, prompts, and absolute local paths", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const result = await runCli(["export", "--source-safe", "--output", ".deepclean/source-safe.json", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          export: {
            sourceSafe: boolean;
            project: string;
            candidates: Array<{ files: Array<{ path: string }>; evidenceIds: string[] }>;
            features: Array<{ ownedFiles: Array<{ path: string }>; testFiles: Array<{ path: string }> }>;
            evidence: Array<{ files: Array<{ path: string }>; title: string }>;
            privacyNotes: string[];
          };
          outputPath: string;
        };
      };
      expect(payload.data.export.sourceSafe).toBe(true);
      expect(payload.data.export.project).toBe(path.basename(repo));
      expect(payload.data.export.candidates.length).toBeGreaterThan(0);
      expect(payload.data.export.features.length).toBeGreaterThan(0);
      expect(payload.data.export.candidates[0]?.files[0]?.path.startsWith("/")).toBe(false);
      expect(payload.data.export.features[0]?.ownedFiles[0]?.path.startsWith("/")).toBe(false);
      const saved = await readFile(payload.data.outputPath, "utf8");
      expect(saved).not.toContain(repo);
      expect(saved).not.toContain("const subtotal");
      expect(saved).not.toContain("providerPrompt");
      expect(saved).not.toContain("promptText");
      expect(saved).not.toContain(".deepclean/reports");
    });
  });

  test("maps semantic feature records as a standalone artifact", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await writeFile(path.join(repo, "package.json"), JSON.stringify({
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run",
        },
      }), "utf8");
      await writeFile(path.join(repo, "src", "checkout.test.ts"), `
import { calculateCheckout } from "./checkout.js";
test("checkout", () => calculateCheckout([], false));
`, "utf8");
      await writeFile(path.join(repo, "src", "money.ts"), "export const cents = 100;\n", "utf8");
      const checkout = await readFile(path.join(repo, "src", "checkout.ts"), "utf8");
      await writeFile(path.join(repo, "src", "checkout.ts"), `import { cents } from "./money.js";\n${checkout}\nvoid cents;\n`, "utf8");
      await mkdir(path.join(repo, "src", "generated"), { recursive: true });
      await writeFile(path.join(repo, "src", "generated", "client.ts"), "export const generated = true;\n", "utf8");
      await mkdir(path.join(repo, "api"), { recursive: true });
      await writeFile(path.join(repo, "api", "users.py"), `
from fastapi import APIRouter
router = APIRouter()
@router.get("/users")
def list_users():
    return []
`, "utf8");
      await mkdir(path.join(repo, "backend", "services"), { recursive: true });
      await mkdir(path.join(repo, "backend", "api"), { recursive: true });
      await writeFile(path.join(repo, "backend", "services", "ledger.py"), "def summarize():\n    return []\n", "utf8");
      await writeFile(path.join(repo, "backend", "api", "orders.py"), `
from fastapi import APIRouter
from backend.services.ledger import summarize
router = APIRouter()
@router.get("/orders")
def list_orders():
    return summarize()
`, "utf8");

      const result = await runCli(["map", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          mapId: string;
          mapSource: string;
          featureCount: number;
          sourceFileCount: number;
          path: string;
          features: Array<{
            featureId: string;
            runId: string;
            title: string;
            kind: string;
            mapSource: string;
            mapperVersion: string;
            ownedFiles: Array<{ path: string }>;
            contextFiles: Array<{ path: string }>;
            testFiles: Array<{ path: string }>;
            fileRoles: Array<{ path: string; role: string }>;
            reasons: string[];
            verification: string[];
          }>;
        };
      };
      expect(payload.data.mapId).toMatch(/^map-/);
      expect(payload.data.mapSource).toBe("heuristic");
      expect(payload.data.sourceFileCount).toBe(7);
      expect(payload.data.featureCount).toBeGreaterThanOrEqual(4);
      expect(payload.data.features.every((feature) => feature.featureId.startsWith("feature-"))).toBe(true);
      expect(payload.data.features.every((feature) => feature.runId === payload.data.mapId)).toBe(true);
      expect(payload.data.features.every((feature) => feature.mapSource === "heuristic")).toBe(true);
      expect(payload.data.features.every((feature) => feature.mapperVersion === "local-v1")).toBe(true);
      expect(payload.data.features.some((feature) => feature.fileRoles.length > 0)).toBe(true);
      expect(payload.data.features.some((feature) => feature.reasons.length > 0)).toBe(true);
      expect(payload.data.features.some((feature) => feature.kind === "package-script")).toBe(true);
      expect(payload.data.features.some((feature) => (
        feature.kind === "module"
        && feature.ownedFiles.some((file) => file.path === "src/checkout.ts")
        && feature.contextFiles.some((file) => file.path === "src/money.ts")
        && feature.testFiles.some((file) => file.path === "src/checkout.test.ts")
      ))).toBe(true);
      expect(payload.data.features.some((feature) => (
        feature.kind === "route"
        && feature.ownedFiles.some((file) => file.path === "api/users.py")
      ))).toBe(true);
      expect(payload.data.features.some((feature) => (
        feature.kind === "route"
        && feature.ownedFiles.some((file) => file.path === "backend/api/orders.py")
        && feature.contextFiles.some((file) => file.path === "backend/services/ledger.py")
      ))).toBe(true);
      expect(payload.data.features.some((feature) => (
        feature.kind === "test-suite"
        && feature.ownedFiles.some((file) => file.path === "src/checkout.test.ts")
      ))).toBe(true);
      expect(payload.data.features.some((feature) => (
        feature.kind === "package-script"
        && feature.verification.includes("npm run test")
      ))).toBe(true);
      expect(payload.data.features.some((feature) => (
        feature.ownedFiles.some((file) => file.path === "src/generated/client.ts")
      ))).toBe(false);
      const saved = await readFile(payload.data.path, "utf8");
      expect(saved).toContain("\"recordType\": \"feature\"");
    });
  });

  test("map validates ClawPatch-style source modes", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const agent = await runCli(["map", "--source", "agent", "--json"], repo);
      expect(agent.code).toBe(2);
      const agentPayload = JSON.parse(agent.stdout) as { error: { code: string } };
      expect(agentPayload.error.code).toBe("unsupported_source");

      const invalid = await runCli(["map", "--source", "vibes", "--json"], repo);
      expect(invalid.code).toBe(2);
      const invalidPayload = JSON.parse(invalid.stdout) as { error: { code: string } };
      expect(invalidPayload.error.code).toBe("invalid_source");
    });
  });

  test("scoped maps keep full-repo context before filtering", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await writeFile(path.join(repo, "src", "checkout.test.ts"), `
import { calculateCheckout } from "./checkout.js";
test("checkout", () => calculateCheckout([], false));
`, "utf8");
      await writeFile(path.join(repo, "src", "money.ts"), "export const cents = 100;\n", "utf8");
      const checkout = await readFile(path.join(repo, "src", "checkout.ts"), "utf8");
      await writeFile(path.join(repo, "src", "checkout.ts"), `import { cents } from "./money.js";\n${checkout}\nvoid cents;\n`, "utf8");

      const result = await runCli(["map", "--paths", "src/checkout.ts", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          sourceFileCount: number;
          features: Array<{
            ownedFiles: Array<{ path: string }>;
            contextFiles: Array<{ path: string }>;
            testFiles: Array<{ path: string }>;
          }>;
        };
      };
      expect(payload.data.sourceFileCount).toBe(4);
      expect(payload.data.features.some((feature) => (
        feature.ownedFiles.some((file) => file.path === "src/checkout.ts")
        && feature.contextFiles.some((file) => file.path === "src/money.ts")
        && feature.testFiles.some((file) => file.path === "src/checkout.test.ts")
      ))).toBe(true);
    });
  });

  test("scoped scans attach candidates to features mapped from full-repo context", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await writeFile(path.join(repo, "src", "checkout.test.ts"), `
import { calculateCheckout } from "./checkout.js";
test("checkout", () => calculateCheckout([], false));
`, "utf8");
      await writeFile(path.join(repo, "src", "money.ts"), "export const cents = 100;\n", "utf8");
      const checkout = await readFile(path.join(repo, "src", "checkout.ts"), "utf8");
      await writeFile(path.join(repo, "src", "checkout.ts"), `import { cents } from "./money.js";\n${checkout}\nvoid cents;\n`, "utf8");

      const result = await runCli(["scan", "--paths", "src/checkout.ts", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          sourceFileCount: number;
          candidates: Array<{ affectedFeatureIds: string[] }>;
          features: Array<{
            featureId: string;
            ownedFiles: Array<{ path: string }>;
            contextFiles: Array<{ path: string }>;
            testFiles: Array<{ path: string }>;
          }>;
        };
      };
      const checkoutFeature = payload.data.features.find((feature) => (
        feature.ownedFiles.some((file) => file.path === "src/checkout.ts")
      ));
      expect(payload.data.sourceFileCount).toBe(1);
      expect(checkoutFeature?.contextFiles.some((file) => file.path === "src/money.ts")).toBe(true);
      expect(checkoutFeature?.testFiles.some((file) => file.path === "src/checkout.test.ts")).toBe(true);
      expect(payload.data.candidates.some((candidate) => (
        candidate.affectedFeatureIds.includes(checkoutFeature?.featureId ?? "")
      ))).toBe(true);
    });
  });

  test("scans source files and produces agent-readable candidates", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(scan.code).toBe(0);
      const scanPayload = JSON.parse(scan.stdout) as {
        ok: boolean;
        data: {
          runId: string;
          featureCount: number;
          evidenceCount: number;
          candidateCount: number;
          candidates: Array<{ id: string; affectedFeatureIds: string[]; featureScope: string }>;
        };
      };
      expect(scanPayload.ok).toBe(true);
      expect(scanPayload.data.featureCount).toBeGreaterThan(0);
      expect(scanPayload.data.evidenceCount).toBeGreaterThan(0);
      expect(scanPayload.data.candidateCount).toBeGreaterThan(0);
      expect(scanPayload.data.candidates[0]?.id).toMatch(/^candidate-/);
      expect(scanPayload.data.candidates.some((candidate) => candidate.affectedFeatureIds.length > 0)).toBe(true);
      expect(scanPayload.data.candidates.some((candidate) => candidate.featureScope !== "unmapped")).toBe(true);
      const features = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "features", `${scanPayload.data.runId}.json`), "utf8"),
      ) as Array<{ kind: string; ownedFiles: Array<{ path: string }> }>;
      expect(features.length).toBe(scanPayload.data.featureCount);
      expect(features.some((feature) => (
        feature.kind === "module"
        && feature.ownedFiles.some((file) => file.path === "src/checkout.ts")
      ))).toBe(true);

      const next = await runCli(["next", "--json"], repo);
      const nextPayload = JSON.parse(next.stdout) as {
        data: {
          opportunity: { id: string; classification: string } | null;
          opportunities: Array<{ id: string; classification: string }>;
          opportunitiesPath: string;
          candidate: { id: string } | null;
        };
      };
      expect(nextPayload.data.candidate?.id).toMatch(/^candidate-/);
      expect(nextPayload.data.opportunity?.id).toMatch(/^opportunity-/);
      expect(nextPayload.data.opportunities.length).toBeGreaterThan(0);
      await expect(stat(nextPayload.data.opportunitiesPath)).resolves.toBeTruthy();

      const opportunityId = nextPayload.data.opportunity?.id ?? nextPayload.data.opportunities[0]?.id ?? "";
      const opportunityPlan = await runCli(["plan", opportunityId, "--json"], repo);
      expect(opportunityPlan.code).toBe(0);
      const opportunityPlanPayload = JSON.parse(opportunityPlan.stdout) as {
        data: { plan: { targetType: string; targetId: string; content: string }; opportunity: { id: string } };
      };
      expect(opportunityPlanPayload.data.plan.targetType).toBe("opportunity");
      expect(opportunityPlanPayload.data.plan.targetId).toBe(opportunityId);
      expect(opportunityPlanPayload.data.opportunity.id).toBe(opportunityId);
      expect(opportunityPlanPayload.data.plan.content).toContain("Stop line:");

      const opportunityHandoff = await runCli(["handoff", opportunityId, "--json"], repo);
      expect(opportunityHandoff.code).toBe(0);
      const opportunityHandoffPayload = JSON.parse(opportunityHandoff.stdout) as {
        data: { handoff: { targetType: string; targetId: string; opportunityId: string; content: string }; opportunity: { id: string } };
      };
      expect(opportunityHandoffPayload.data.handoff.targetType).toBe("opportunity");
      expect(opportunityHandoffPayload.data.handoff.targetId).toBe(opportunityId);
      expect(opportunityHandoffPayload.data.handoff.opportunityId).toBe(opportunityId);
      expect(opportunityHandoffPayload.data.handoff.content).toContain("Opportunity:");

      const id = nextPayload.data.candidate?.id;
      expect(id).toBeTruthy();
      const show = await runCli(["show", id ?? "", "--json"], repo);
      const showPayload = JSON.parse(show.stdout) as {
        data: { candidate: { id: string }; evidence: unknown[]; features: unknown[] };
      };
      expect(showPayload.data.candidate.id).toBe(id);
      expect(showPayload.data.evidence.length).toBeGreaterThan(0);
      expect(showPayload.data.features.length).toBeGreaterThan(0);

      const campaign = await runCli(["campaign", "--json"], repo);
      expect(campaign.code).toBe(0);
      const campaignPayload = JSON.parse(campaign.stdout) as {
        data: {
          summary: {
            counts: { byClassification: Record<string, number> };
            recommendedOpportunityId?: string;
            stopCampaignRationale?: string;
          };
          opportunities: Array<{ id: string; classification: string }>;
        };
      };
      expect(campaignPayload.data.opportunities.length).toBeGreaterThan(0);
      expect(Object.values(campaignPayload.data.summary.counts.byClassification).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
    });
  });

  test("scan ignores gitignored generated source files", async () => {
    await withTempRepo(async (repo) => {
      await execFileAsync("git", ["init"], { cwd: repo });
      await writeFixtureSource(repo);
      await mkdir(path.join(repo, ".site-dist"), { recursive: true });
      await writeFile(path.join(repo, ".gitignore"), ".site-dist/\n", "utf8");
      await writeFile(path.join(repo, ".site-dist", "constellation.js"), `
export function generatedConstellation() {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discount = coupon ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * 0.07;
  const total = subtotal - discount + tax;
  if (total < 0) throw new Error('invalid total');
  return { subtotal, discount, tax, total };
}
`, "utf8");

      const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(scan.code).toBe(0);
      const scanPayload = JSON.parse(scan.stdout) as {
        data: {
          features: Array<{ ownedFiles: Array<{ path: string }> }>;
          candidates: Array<{ files: Array<{ path: string }> }>;
        };
      };
      const candidatePaths = scanPayload.data.candidates.flatMap((candidate) => candidate.files.map((file) => file.path));
      const featurePaths = scanPayload.data.features.flatMap((feature) => feature.ownedFiles.map((file) => file.path));
      expect(candidatePaths.some((file) => file.startsWith(".site-dist/"))).toBe(false);
      expect(featurePaths.some((file) => file.startsWith(".site-dist/"))).toBe(false);
    });
  });

  test("scan ignores default build, vendor, and generated noise directories", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const noisyDirs = ["dist", "build", "vendor", "src/__generated__"];
      for (const dir of noisyDirs) {
        await mkdir(path.join(repo, dir), { recursive: true });
        await writeFile(path.join(repo, dir, "noise.ts"), Array.from({ length: 160 }, (_, index) => (
          `export const generatedValue${index} = ${index};`
        )).join("\n"), "utf8");
      }

      const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(scan.code).toBe(0);
      const payload = JSON.parse(scan.stdout) as {
        data: {
          candidates: Array<{ files: Array<{ path: string }> }>;
          features: Array<{ ownedFiles: Array<{ path: string }> }>;
        };
      };
      const candidatePaths = payload.data.candidates.flatMap((candidate) => candidate.files.map((file) => file.path));
      const featurePaths = payload.data.features.flatMap((feature) => feature.ownedFiles.map((file) => file.path));
      for (const dir of noisyDirs) {
        expect(candidatePaths.some((file) => file.startsWith(`${dir}/`))).toBe(false);
        expect(featurePaths.some((file) => file.startsWith(`${dir}/`))).toBe(false);
      }
    });
  });

  test("links repeated scans to stable findings and lifecycle history", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const first = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(first.code).toBe(0);
      const firstPayload = JSON.parse(first.stdout) as {
        data: { candidates: Array<{ id: string; findingId?: string; signature?: { value: string }; files: Array<{ path: string }> }> };
      };
      const firstCandidate = firstPayload.data.candidates.find((candidate) => (
        candidate.files.some((file) => file.path === "src/checkout.ts")
      ));
      expect(firstCandidate?.findingId).toMatch(/^finding-/);
      expect(firstCandidate?.signature?.value).toMatch(/^sig-/);

      await writeFile(path.join(repo, "src", "checkout.ts"), `

export function calculateCheckout(items: Array<{ price: number }>, coupon: boolean) {
${Array.from({ length: 96 }, (_, index) => `  const value${index} = ${index};`).join("\n")}
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discount = coupon ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * 0.07;
  const total = subtotal - discount + tax;
  if (total < 0) throw new Error('invalid total');
  return { subtotal, discount, tax, total };
}
`, "utf8");

      const second = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(second.code).toBe(0);
      const secondPayload = JSON.parse(second.stdout) as {
        data: { candidates: Array<{ id: string; findingId?: string; files: Array<{ path: string }> }> };
      };
      const secondCandidate = secondPayload.data.candidates.find((candidate) => (
        candidate.files.some((file) => file.path === "src/checkout.ts")
      ));
      expect(secondCandidate?.findingId).toBe(firstCandidate?.findingId);

      const history = await runCli(["history", firstCandidate?.findingId ?? "", "--json"], repo);
      expect(history.code).toBe(0);
      const historyPayload = JSON.parse(history.stdout) as {
        data: { finding: { id: string; observationIds: string[] }; events: Array<{ kind: string }> };
      };
      expect(historyPayload.data.finding.id).toBe(firstCandidate?.findingId);
      expect(historyPayload.data.finding.observationIds.length).toBeGreaterThanOrEqual(2);
      expect(historyPayload.data.events.filter((event) => event.kind === "observed").length).toBeGreaterThanOrEqual(2);

      const candidateHistory = await runCli(["history", secondCandidate?.id ?? "", "--json"], repo);
      expect(candidateHistory.code).toBe(0);
      const candidateHistoryPayload = JSON.parse(candidateHistory.stdout) as {
        data: { finding: { id: string }; candidate: { id: string } };
      };
      expect(candidateHistoryPayload.data.finding.id).toBe(firstCandidate?.findingId);
      expect(candidateHistoryPayload.data.candidate.id).toBe(secondCandidate?.id);
    });
  });

  test("show resolves historical candidate observations with --run", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const first = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(first.code).toBe(0);
      const firstPayload = JSON.parse(first.stdout) as {
        data: { runId: string; candidates: Array<{ id: string; findingId?: string }> };
      };
      const firstRunId = firstPayload.data.runId;
      const firstCandidateId = firstPayload.data.candidates[0]?.id;
      expect(firstCandidateId).toBeTruthy();

      const second = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(second.code).toBe(0);

      const show = await runCli(["show", firstCandidateId ?? "", "--run", firstRunId, "--json"], repo);
      expect(show.code).toBe(0);
      const showPayload = JSON.parse(show.stdout) as {
        data: {
          runId: string;
          candidate: { id: string; runId: string; findingId?: string };
          observation?: { runId: string; candidateId: string };
          finding?: { id: string };
        };
      };
      expect(showPayload.data.runId).toBe(firstRunId);
      expect(showPayload.data.candidate.id).toBe(firstCandidateId);
      expect(showPayload.data.candidate.runId).toBe(firstRunId);
      expect(showPayload.data.observation?.runId).toBe(firstRunId);
      expect(showPayload.data.observation?.candidateId).toBe(firstCandidateId);
      expect(showPayload.data.finding?.id).toBe(showPayload.data.candidate.findingId);

      const history = await runCli(["history", firstCandidateId ?? "", "--run", firstRunId, "--json"], repo);
      expect(history.code).toBe(0);
      const historyPayload = JSON.parse(history.stdout) as {
        data: { candidate: { id: string; runId: string } };
      };
      expect(historyPayload.data.candidate.id).toBe(firstCandidateId);
      expect(historyPayload.data.candidate.runId).toBe(firstRunId);
    });
  });

  test("lazy migration upgrades alpha-style candidates and emits diagnostics", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(scan.code).toBe(0);
      const scanPayload = JSON.parse(scan.stdout) as {
        data: { runId: string; candidates: Array<{ id: string }> };
      };
      const runId = scanPayload.data.runId;
      const candidateId = scanPayload.data.candidates[0]?.id;
      expect(candidateId).toBeTruthy();

      const candidatesPath = path.join(repo, ".deepclean", "candidates", `${runId}.json`);
      const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as Array<Record<string, unknown>>;
      const stripped = candidates.map((candidate) => {
        const { findingId: _findingId, signature: _signature, identityConfidence: _identityConfidence, lifecycleState: _lifecycleState, baselineStatus: _baselineStatus, ...rest } = candidate;
        return rest;
      });
      await writeFile(candidatesPath, `${JSON.stringify(stripped, null, 2)}\n`, "utf8");

      for (const dir of ["findings", "observations", "lifecycle", "identity-matches"] as const) {
        const full = path.join(repo, ".deepclean", dir);
        await rm(full, { recursive: true, force: true });
        await mkdir(full, { recursive: true });
      }

      const show = await runCli(["show", candidateId ?? "", "--json"], repo);
      expect(show.code).toBe(0);
      const payload = JSON.parse(show.stdout) as {
        data: { candidate: { findingId?: string } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.candidate.findingId).toMatch(/^finding-/);
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "alpha_state_migrated")).toBe(true);

      const findings = await readdir(path.join(repo, ".deepclean", "findings"));
      const observations = await readdir(path.join(repo, ".deepclean", "observations"));
      const identityMatches = await readdir(path.join(repo, ".deepclean", "identity-matches"));
      expect(findings.length).toBeGreaterThan(0);
      expect(observations.length).toBeGreaterThan(0);
      expect(identityMatches.length).toBeGreaterThan(0);
    });
  });

  test("revalidate records an unchanged finding from a fresh scan", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const candidates = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "candidates", (await latestRunFile(repo))), "utf8"),
      ) as Array<{ id: string; findingId?: string }>;
      const target = candidates[0]?.findingId;
      expect(target).toBeTruthy();

      const result = await runCli(["revalidate", target ?? "", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { revalidations: Array<{ outcome: string; targetId?: string }> };
      };
      expect(payload.data.revalidations[0]?.targetId).toBe(target);
      expect(payload.data.revalidations[0]?.outcome).toBe("still-open");
      expect(payload.data.revalidations[0]).toMatchObject({
        confidence: expect.any(String),
        rationale: expect.any(String),
        nextAction: expect.any(String),
      });

      const history = await runCli(["history", target ?? "", "--json"], repo);
      const historyPayload = JSON.parse(history.stdout) as {
        data: { events: Array<{ kind: string; data?: { outcome?: string } }> };
      };
      expect(historyPayload.data.events.some((event) => (
        event.kind === "revalidated"
        && event.data?.outcome === "still-open"
      ))).toBe(true);
    });
  });

  test("passed verification alone does not prove resolution", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const candidates = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "candidates", (await latestRunFile(repo))), "utf8"),
      ) as Array<{ id: string; findingId?: string }>;
      const candidate = candidates.find((item) => item.findingId);
      expect(candidate?.findingId).toBeTruthy();

      await mkdir(path.join(repo, ".deepclean", "fixes"), { recursive: true });
      await writeFile(path.join(repo, ".deepclean", "fixes", "fix-proof-only.json"), `${JSON.stringify({
        schemaVersion,
        recordType: "fix_attempt",
        id: "fix-proof-only",
        findingId: candidate?.findingId,
        candidateId: candidate?.id,
        status: "passed",
        outcome: "partially-resolved",
        dryRun: false,
        changedFiles: ["src/invoice.ts"],
        verificationCommands: ["npm test"],
        verificationResults: [{ command: "npm test", exitCode: 0, passed: true }],
        diagnostics: [],
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
      }, null, 2)}\n`, "utf8");

      const show = await runCli(["show", candidate?.id ?? "candidate-001", "--json"], repo);
      expect(show.code).toBe(0);
      const payload = JSON.parse(show.stdout) as {
        data: {
          latestVerificationResult?: { passed: boolean };
          proofStatus: { proofState: string; resolved: boolean; nextAction: string };
        };
      };
      expect(payload.data.latestVerificationResult?.passed).toBe(true);
      expect(payload.data.proofStatus.proofState).toBe("unproven");
      expect(payload.data.proofStatus.resolved).toBe(false);
      expect(payload.data.proofStatus.nextAction).toContain("Verification passed");
    });
  });

  test("scan supports incremental git and dirty-tree scope", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });

      await writeFile(path.join(repo, "src", "invoice.ts"), `
export function calculateInvoice(items: Array<{ price: number }>, coupon: boolean) {
  const adjustment = 1;
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discount = coupon ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * 0.07;
  const total = subtotal - discount + tax;
  if (total < 0) throw new Error('invalid total');
  return { subtotal, discount, tax, total, adjustment };
}
`, "utf8");
      await execFileAsync("git", ["add", "src/invoice.ts"], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "change invoice"], { cwd: repo });

      await writeFile(path.join(repo, "src", "checkout.ts"), `
export function calculateCheckout(items: Array<{ price: number }>, coupon: boolean) {
${Array.from({ length: 120 }, (_, index) => `  const dirtyValue${index} = ${index};`).join("\n")}
  return { total: items.length + Number(coupon) };
}
`, "utf8");

      const result = await runCli(["scan", "--since", "HEAD~1", "--include-dirty", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          sourceFileCount: number;
          scope: { incremental: boolean; changedPaths: string[]; dirtyPaths: string[]; includeDirty: boolean };
          runId: string;
        };
      };
      expect(payload.data.scope.incremental).toBe(true);
      expect(payload.data.scope.includeDirty).toBe(true);
      expect(payload.data.scope.changedPaths).toEqual(expect.arrayContaining(["src/invoice.ts", "src/checkout.ts"]));
      expect(payload.data.scope.dirtyPaths).toContain("src/checkout.ts");
      expect(payload.data.sourceFileCount).toBe(2);

      const evidence = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "evidence", `${payload.data.runId}.json`), "utf8"),
      ) as Array<{ files: Array<{ path: string }>; data: { dirtyTree?: boolean } }>;
      expect(evidence.some((record) => (
        record.data.dirtyTree === true
        && record.files.some((file) => file.path === "src/checkout.ts")
      ))).toBe(true);
    });
  });

  test("scan supports path, category, and new-only filters", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const result = await runCli([
        "scan",
        "--paths",
        "src/checkout.ts",
        "--categories",
        "complexity",
        "--new-only",
        "--evidence-only",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          sourceFileCount: number;
          candidates: Array<{ category: string; baselineStatus?: string; files: Array<{ path: string }> }>;
          scope: { paths: string[]; categories: string[]; newOnly: boolean };
        };
      };
      expect(payload.data.sourceFileCount).toBe(1);
      expect(payload.data.scope.paths).toEqual(["src/checkout.ts"]);
      expect(payload.data.scope.categories).toEqual(["complexity"]);
      expect(payload.data.scope.newOnly).toBe(true);
      expect(payload.data.candidates.length).toBeGreaterThan(0);
      expect(payload.data.candidates.every((candidate) => candidate.category === "complexity")).toBe(true);
      expect(payload.data.candidates.every((candidate) => candidate.baselineStatus === "new")).toBe(true);
      expect(payload.data.candidates.every((candidate) => (
        candidate.files.some((file) => file.path === "src/checkout.ts")
      ))).toBe(true);
    });
  });

  test("ci mode passes, fails policy, and writes artifacts", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const pass = await runCli(["ci", "--evidence-only", "--json", "--max-new-p0", "0"], repo);
      expect(pass.code).toBe(0);
      const passPayload = JSON.parse(pass.stdout) as {
        data: { ciRun: { status: string }; qualityGateResult: { profileId: string }; result: { blockingFindingIds: string[] } };
      };
      expect(passPayload.data.ciRun.status).toBe("passed");
      expect(passPayload.data.qualityGateResult.profileId).toBe("ad-hoc");
      expect(passPayload.data.result.blockingFindingIds).toEqual([]);

      const balanced = await runCli(["ci", "--evidence-only", "--json", "--profile", "balanced"], repo);
      expect(balanced.code).toBe(0);
      const balancedPayload = JSON.parse(balanced.stdout) as {
        data: {
          ciRun: { status: string };
          qualityProfile: { id: string; recommendedAnalyzerClasses: string[] };
          qualityGateResult: {
            status: string;
            blockers: unknown[];
            advisories: Array<{ id: string; title: string }>;
            coverageStatus: Array<{ status: string; analyzerIds: string[] }>;
          };
        };
      };
      expect(balancedPayload.data.ciRun.status).toBe("passed");
      expect(balancedPayload.data.qualityProfile.id).toBe("balanced");
      expect(balancedPayload.data.qualityProfile.recommendedAnalyzerClasses).toContain("semgrep");
      expect(balancedPayload.data.qualityGateResult.status).toBe("advisory");
      expect(balancedPayload.data.qualityGateResult.blockers).toEqual([]);
      expect(balancedPayload.data.qualityGateResult.advisories.some((item) => item.id === "missing-semgrep")).toBe(true);
      expect(balancedPayload.data.qualityGateResult.coverageStatus.some((item) => item.status === "not-configured")).toBe(true);

      const fail = await runCli([
        "ci",
        "--evidence-only",
        "--json",
        "--max-p2",
        "0",
        "--output",
        ".deepclean/ci/summary.md",
        "--sarif",
        ".deepclean/ci/deepclean.sarif",
      ], repo);
      expect(fail.code).toBe(3);
      const failPayload = JSON.parse(fail.stdout) as {
        data: {
          ciRun: { status: string; artifactPaths: { markdown?: string; sarif?: string } };
          result: { blockingFindingIds: string[] };
        };
      };
      expect(failPayload.data.ciRun.status).toBe("policy-failed");
      expect(failPayload.data.result.blockingFindingIds.length).toBeGreaterThan(0);
      expect(await readFile(failPayload.data.ciRun.artifactPaths.markdown ?? "", "utf8")).toContain("# Deepclean CI");
      const sarif = JSON.parse(await readFile(failPayload.data.ciRun.artifactPaths.sarif ?? "", "utf8")) as { version: string };
      expect(sarif.version).toBe("2.1.0");
    });
  });

  test("schemas emits GA candidate machine contracts", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["schemas", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { stability: string; contracts: Array<{ command: string; requiredFields: string[] }> };
      };
      expect(payload.data.stability).toBe("ga-candidate");
      expect(payload.data.contracts.map((contract) => contract.command)).toContain("review-pr");
      expect(payload.data.contracts.map((contract) => contract.command)).toContain("fix --mode guarded");
      expect(payload.data.contracts.find((contract) => contract.command === "review-pr")?.requiredFields).toContain("riskSummary");
    });
  });

  test("review-pr emits source-safe PR context for review agents", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });
      await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: repo });
      const changedBody = Array.from({ length: 120 }, (_, index) => `  const changed${index} = ${index};`).join("\n");
      await writeFile(path.join(repo, "src", "checkout.ts"), `export function checkoutChanged() {\n${changedBody}\n  return true;\n}\n`, "utf8");
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "change checkout"], { cwd: repo });

      const result = await runCli([
        "review-pr",
        "--state-dir",
        ".octocheck/deepclean",
        "--output",
        ".octocheck/deepclean/review-pr.json",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          recordType: string;
          base: string;
          head: string;
          changedFiles: string[];
          relatedCandidates: Array<{ id: string; suggestedDirection: string }>;
          riskSummary: { level: string };
          promptContext: string;
          outputPath: string;
        };
      };
      expect(payload.data.recordType).toBe("review_pr_context");
      expect(payload.data.base).toBe("origin/main");
      expect(payload.data.head).toBe("HEAD");
      expect(payload.data.changedFiles).toEqual(["src/checkout.ts"]);
      expect(payload.data.relatedCandidates.length).toBeGreaterThan(0);
      expect(payload.data.promptContext).toContain("# Deepclean PR Context");
      await expect(stat(payload.data.outputPath)).resolves.toBeTruthy();
    });
  });

  test("review-pr judges a PR against a target candidate", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });
      await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: repo });

      const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(scan.code).toBe(0);
      const scanPayload = JSON.parse(scan.stdout) as {
        data: { candidates: Array<{ id: string; files: Array<{ path: string }> }> };
      };
      const target = scanPayload.data.candidates.find((candidate) => (
        candidate.files.some((file) => file.path === "src/checkout.ts")
      ));
      expect(target?.id).toMatch(/^candidate-/);

      await writeFile(path.join(repo, "src", "checkout.ts"), "export const checkoutChanged = true;\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "change checkout"], { cwd: repo });

      const result = await runCli(["review-pr", "--target", target?.id ?? "", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          targetVerdict?: {
            targetId: string;
            targetType: string;
            verdict: string;
            ownedFiles: string[];
            changedDoNotTouchFiles: string[];
          };
        };
      };
      expect(payload.data.targetVerdict?.targetId).toBe(target?.id);
      expect(payload.data.targetVerdict?.targetType).toBe("candidate");
      expect(payload.data.targetVerdict?.verdict).toBe("addresses-target");
      expect(payload.data.targetVerdict?.ownedFiles).toContain("src/checkout.ts");
      expect(payload.data.targetVerdict?.changedDoNotTouchFiles).toEqual([]);
    });
  });

  test("review-pr emits an empty related context for a zero-change diff", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });
      await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: repo });

      const result = await runCli(["review-pr", "--state-dir", ".octocheck/deepclean", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { changedFiles: string[]; relatedCandidates: unknown[]; architectureNeighborhoods: unknown[]; riskSummary: { level: string; reasons: string[] } };
      };
      expect(payload.data.changedFiles).toEqual([]);
      expect(payload.data.relatedCandidates).toEqual([]);
      expect(payload.data.architectureNeighborhoods).toEqual([]);
      expect(payload.data.riskSummary.level).toBe("low");
      expect(payload.data.riskSummary.reasons[0]).toContain("No related");
    });
  });

  test("review-pr fails when the PR diff cannot be resolved", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });

      const result = await runCli(["review-pr", "--base", "refs/remotes/origin/missing", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string }; diagnostics: Array<{ code: string }> };
      expect(payload.error.code).toBe("review_pr_diff_unresolved");
      expect(payload.diagnostics.map((diagnostic) => diagnostic.code)).toContain("review_pr_diff_unresolved");
    });
  });

  test("review-pr refuses output outside the configured state directory", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });
      await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: repo });

      const result = await runCli([
        "review-pr",
        "--state-dir",
        ".octocheck/deepclean",
        "--output",
        "../outside.json",
        "--json",
      ], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string; message: string } };
      expect(payload.error.code).toBe("review_pr_output_outside_state_dir");
      expect(payload.error.message).toContain("state directory");
    });
  });

  test("ci mode uses synthesis by default when a provider is configured", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
const evidenceIds = [...stdin.matchAll(/"id": "(ev-[^"]+)"/g)].map((match) => match[1]);
if (evidenceIds.length === 0) process.exit(2);
const outputPath = process.argv[process.argv.indexOf("-o") + 1];
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: [{
    title: "Shared calculation boundary needs cleanup",
    category: "architecture",
    priority: "P1",
    confidence: "high",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    readiness: "fix-ready",
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    contextFiles: [],
    evidenceIds,
    whyItMatters: "The cleanup should be prioritized from evidence.",
    likelyRootCause: "The same responsibility is spread across files.",
    suggestedDirection: "Create one focused module for the shared behavior.",
    expectedBehavior: "Checkout calculation behavior stays the same.",
    proofRequired: ["A regression test covers shared checkout calculation behavior."],
    nonGoals: ["Do not rewrite invoice behavior in this slice."],
    doNotTouch: ["public CLI output"],
    splitChildren: [],
    confidenceDowngradeReasons: [],
    verification: ["npm test"],
    fixReadiness: {
      minimumFixScope: "One shared calculation module.",
      suggestedRegressionTest: "Add a regression test around shared checkout calculation behavior.",
      whyCurrentTestsMissIt: "The fixture has no behavior-level regression test for the shared boundary.",
      confidenceDowngradeReasons: []
    },
    supportingQuotes: []
  }],
  rejectedEvidenceIds: [],
  notes: []
}));
`);

      const result = await runCli(["ci", "--require-synthesis", "--json", "--max-new-p0", "0"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          scan: {
            synthesis: { requested: boolean; candidateCount: number };
            candidates: Array<{ provenance: { source: string } }>;
          };
        };
      };
      expect(payload.data.scan.synthesis.requested).toBe(true);
      expect(payload.data.scan.synthesis.candidateCount).toBe(1);
      expect(payload.data.scan.candidates[0]?.provenance.source).toBe("model-synthesis");
    });
  });

  test("ci mode fails fast when synthesis is required but disabled", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const result = await runCli(["ci", "--require-synthesis", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("ci_synthesis_required");
    });
  });

  test("ci mode fails when required synthesis provider is unavailable", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["init", "--json"], repo);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        reviewSynthesis: { command: string };
      };
      config.reviewSynthesis.command = path.join(repo, "missing-codex");
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const result = await runCli(["ci", "--require-synthesis", "--json", "--max-new-p0", "0"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as {
        ok: boolean;
        error: { code: string };
        diagnostics: Array<{ code: string; level: string }>;
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("ci_synthesis_failed");
      expect(payload.diagnostics.some((diagnostic) => (
        diagnostic.code === "codex_provider_unavailable"
        && diagnostic.level === "error"
      ))).toBe(true);
    });
  });

  test("classifies revalidation outcomes", async () => {
    await withTempRepo(async (repo) => {
      const finding = await expectStillOpenRevalidation(repo);

      const progressFinding = findingFixture({
        evidenceIds: ["ev-before"],
        files: [{ path: "src/example.ts", startLine: 1, endLine: 120 }],
      });
      const progress = await classifyRevalidation({
        root: repo,
        finding: progressFinding,
        currentCandidates: [candidateFixture({ findingId: progressFinding.id, evidenceIds: ["ev-after"] })],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
        previousEvidence: [evidenceFixture({
          id: "ev-before",
          kind: "large-function",
          files: [{ path: "src/example.ts", startLine: 1, endLine: 120 }],
          data: { lines: 120, name: "example" },
        })],
        currentEvidence: [evidenceFixture({
          id: "ev-after",
          kind: "large-function",
          files: [{ path: "src/example.ts", startLine: 1, endLine: 80 }],
          data: { lines: 80, name: "example" },
        })],
      });
      expect(progress.outcome).toBe("partially-resolved");
      expect(progress.progress?.delta).toBe(40);
      expect(progress.nextAction).toContain("campaign progress");

      const dependencyFinding = findingFixture({
        evidenceIds: ["ev-deps-before"],
        files: [{ path: "src/example.ts" }],
      });
      const dependencyProgress = await classifyRevalidation({
        root: repo,
        finding: dependencyFinding,
        currentCandidates: [candidateFixture({ findingId: dependencyFinding.id, evidenceIds: ["ev-deps-after"] })],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
        previousEvidence: [evidenceFixture({
          id: "ev-deps-before",
          kind: "dependency-hotspot",
          files: [{ path: "src/example.ts" }],
          data: { incoming: 12, outgoing: 4 },
        })],
        currentEvidence: [evidenceFixture({
          id: "ev-deps-after",
          kind: "dependency-hotspot",
          files: [{ path: "src/example.ts" }],
          data: { incoming: 8, outgoing: 4 },
        })],
      });
      expect(dependencyProgress.outcome).toBe("partially-resolved");
      expect(dependencyProgress.progress?.metric).toBe("dependency-hotspot.incoming");
      expect(dependencyProgress.progress?.delta).toBe(4);

      const changed = await classifyRevalidation({
        root: repo,
        finding,
        currentCandidates: [candidateFixture({ findingId: "finding-other", category: finding.category })],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(changed.outcome).toBe("partially-resolved");

      const superseded = await classifyRevalidation({
        root: repo,
        finding,
        currentCandidates: [candidateFixture({
          findingId: "finding-replacement",
          category: finding.category,
          impact: "cross-cutting",
        })],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(superseded.outcome).toBe("superseded");
      expect(superseded.replacementFindingId).toBe("finding-replacement");

      const stale = await classifyRevalidation({
        root: repo,
        finding: { ...finding, files: [{ path: "src/missing.ts" }] },
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(stale.outcome).toBe("stale");

      const resolved = await classifyRevalidation({
        root: repo,
        finding,
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(resolved.outcome).toBe("resolved");

      const inconclusive = await classifyRevalidation({
        root: repo,
        finding: undefined,
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(inconclusive.outcome).toBe("inconclusive");

      const needsHuman = await classifyRevalidation({
        root: repo,
        finding,
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
        forceNeedsHuman: "Target is too broad.",
      });
      expect(needsHuman.outcome).toBe("needs-human");
    });
  });

  test("triage requires a note for non-open statuses", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const result = await runCli(["triage", "candidate-001", "--status", "ignored", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("note_required");
    });
  });

  test("handoff writes an agent packet", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const result = await runCli(["handoff", "candidate-001", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { handoff: { content: string }; path: string };
      };
      expect(payload.data.handoff.content).toContain("TASK:");
      expect(payload.data.handoff.content).toContain("Tests first:");
      expect(payload.data.handoff.content).toContain("Do not:");
      const saved = await readFile(payload.data.path, "utf8");
      expect(saved).toContain("candidateId");
    });
  });

  test("clusters related candidates and writes a cluster artifact", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const result = await runCli(["cluster", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { clusters: Array<{ id: string; candidateIds: string[] }>; path: string };
      };
      expect(payload.data.clusters.length).toBeGreaterThan(0);
      expect(payload.data.clusters[0]?.id).toMatch(/^theme-/);
      expect(payload.data.clusters[0]?.candidateIds.length).toBeGreaterThan(1);
      const saved = await readFile(payload.data.path, "utf8");
      expect(saved).toContain("candidateIds");
    });
  });

  test("plan writes an agent packet for a cluster", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      await runCli(["cluster", "--json"], repo);
      const result = await runCli(["plan", "theme-001", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { plan: { targetType: string; content: string; steps: unknown[] }; path: string };
      };
      expect(payload.data.plan.targetType).toBe("cluster");
      expect(payload.data.plan.steps.length).toBeGreaterThan(1);
      expect(payload.data.plan.content).toContain("TASK:");
      expect(payload.data.plan.content).toContain("Slice Queue:");
      expect(payload.data.plan.content).toContain("Expected No-op Behavior:");
      const saved = await readFile(payload.data.path, "utf8");
      expect(saved).toContain("constraints");
    });
  });

  test("report includes start-here recommendations for agents", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const result = await runCli(["report", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          report: {
            recommendations?: {
              startHere?: { id: string; type: string; featureId?: string; featureTitle?: string };
              suggestedPlanTargets: string[];
            };
          };
          paths: { markdownPath: string };
          reportPath: string;
          markdownPath: string;
          jsonPath: string;
        };
      };
      expect(payload.data.report.recommendations?.startHere?.id).toMatch(/^(candidate|theme)-/);
      expect(payload.data.report.recommendations?.startHere?.featureId).toMatch(/^feature-/);
      expect(payload.data.report.recommendations?.suggestedPlanTargets.length).toBeGreaterThan(0);
      expect(payload.data.reportPath).toBe(payload.data.paths.markdownPath);
      expect(payload.data.markdownPath).toBe(payload.data.paths.markdownPath);
      expect(payload.data.jsonPath).toMatch(/\.json$/);
      const markdown = await readFile(payload.data.paths.markdownPath, "utf8");
      expect(markdown).toContain("## Start Here");
      expect(markdown).toContain("## Feature Map");
      expect(markdown).toContain("Feature scope:");
      expect(markdown).toContain("## Agent Queue");
      expect(markdown).toContain("Suggested plan targets:");
    });
  });

  test("shared filters apply to report, list, next, and queue export", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const filters = ["--status", "open", "--category", "complexity", "--path", "src/checkout.ts"];

      const list = await runCli(["list", ...filters, "--format", "codex", "--json"], repo);
      expect(list.code).toBe(0);
      const listPayload = JSON.parse(list.stdout) as {
        data: {
          count: number;
          candidates: Array<{ id: string; category: string; files: Array<{ path: string }> }>;
          queue: Array<{ findingId: string; verification: string[] }>;
        };
      };
      expect(listPayload.data.count).toBeGreaterThan(0);
      expect(listPayload.data.queue[0]?.findingId).toMatch(/^finding-/);
      expect(listPayload.data.queue[0]?.verification.length).toBeGreaterThan(0);
      expect(listPayload.data.candidates.every((candidate) => candidate.category === "complexity")).toBe(true);
      expect(listPayload.data.candidates.every((candidate) => (
        candidate.files.some((file) => file.path === "src/checkout.ts")
      ))).toBe(true);

      const report = await runCli(["report", ...filters, "--json"], repo);
      const reportPayload = JSON.parse(report.stdout) as {
        data: { filters: { category?: string; path?: string }; candidates: Array<{ id: string }> };
      };
      expect(reportPayload.data.filters.category).toBe("complexity");
      expect(reportPayload.data.filters.path).toBe("src/checkout.ts");
      expect(reportPayload.data.candidates.map((candidate) => candidate.id)).toEqual(
        listPayload.data.candidates.map((candidate) => candidate.id),
      );

      const next = await runCli(["next", ...filters, "--json"], repo);
      const nextPayload = JSON.parse(next.stdout) as { data: { candidate: { id: string } | null } };
      expect(nextPayload.data.candidate?.id).toBe(listPayload.data.candidates[0]?.id);
    });
  });

  test("feature filters apply to report, list, and next", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
      const scanPayload = JSON.parse(scan.stdout) as {
        data: { candidates: Array<{ affectedFeatureIds: string[] }> };
      };
      const featureId = scanPayload.data.candidates.find((candidate) => candidate.affectedFeatureIds.length > 0)
        ?.affectedFeatureIds[0];
      expect(featureId).toBeTruthy();

      const list = await runCli(["list", "--feature", featureId ?? "", "--json"], repo);
      expect(list.code).toBe(0);
      const listPayload = JSON.parse(list.stdout) as {
        data: {
          filters: { feature?: string };
          selectedFeature?: { featureId: string };
          candidates: Array<{ affectedFeatureIds: string[] }>;
        };
      };
      expect(listPayload.data.filters.feature).toBe(featureId);
      expect(listPayload.data.selectedFeature?.featureId).toBe(featureId);
      expect(listPayload.data.candidates.length).toBeGreaterThan(0);
      expect(listPayload.data.candidates.every((candidate) => candidate.affectedFeatureIds.includes(featureId ?? ""))).toBe(true);

      const report = await runCli(["report", "--feature", featureId ?? "", "--json"], repo);
      expect(report.code).toBe(0);
      const reportPayload = JSON.parse(report.stdout) as {
        data: { selectedFeature?: { featureId: string }; candidates: Array<{ affectedFeatureIds: string[] }> };
      };
      expect(reportPayload.data.selectedFeature?.featureId).toBe(featureId);
      expect(reportPayload.data.candidates.every((candidate) => candidate.affectedFeatureIds.includes(featureId ?? ""))).toBe(true);

      const next = await runCli(["next", "--feature", featureId ?? "", "--json"], repo);
      expect(next.code).toBe(0);
      const nextPayload = JSON.parse(next.stdout) as {
        data: { selectedFeature?: { featureId: string }; candidate: { affectedFeatureIds: string[] } | null };
      };
      expect(nextPayload.data.selectedFeature?.featureId).toBe(featureId);
      expect(nextPayload.data.candidate?.affectedFeatureIds).toContain(featureId);
    });
  });

  test("handoff warns for stale findings", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--evidence-only", "--json"], repo);
      const candidatesPath = path.join(repo, ".deepclean", "candidates", await latestRunFile(repo));
      const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as Array<{ id: string; lifecycleState?: string; status?: string }>;
      candidates[0] = { ...candidates[0]!, lifecycleState: "stale", status: "stale" };
      await writeFile(candidatesPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");

      const handoff = await runCli(["handoff", candidates[0]?.id ?? "candidate-001", "--json"], repo);
      expect(handoff.code).toBe(0);
      const payload = JSON.parse(handoff.stdout) as { data: { warnings: string[] } };
      expect(payload.data.warnings.some((warning) => warning.includes("stale"))).toBe(true);
    });
  });

  test("scan infers repo-specific verification commands", async () => {
    await withTempRepo(async (repo) => {
      await mkdir(path.join(repo, "backend"), { recursive: true });
      await mkdir(path.join(repo, "frontend"), { recursive: true });
      const pythonBody = Array.from({ length: 180 }, (_, index) => `    value_${index} = ${index}`).join("\n");
      await writeFile(path.join(repo, "backend", "service.py"), `def run():\n${pythonBody}\n    return True\n`, "utf8");
      await writeFile(path.join(repo, "frontend", "package.json"), JSON.stringify({
        scripts: {
          "test:run": "vitest run",
          build: "next build",
        },
      }), "utf8");
      const tsBody = Array.from({ length: 120 }, (_, index) => `  const value${index} = ${index};`).join("\n");
      await writeFile(path.join(repo, "frontend", "app.ts"), `export function app() {\n${tsBody}\n  return true;\n}\n`, "utf8");
      await writeFile(path.join(repo, "Makefile"), "lint:\n\ttrue\n\ntypecheck:\n\ttrue\n\ntest:\n\ttrue\n", "utf8");

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { candidates: Array<{ files: Array<{ path: string }>; verification: string[] }> };
      };
      const backendCandidate = payload.data.candidates.find((candidate) => (
        candidate.files.some((file) => file.path.startsWith("backend/"))
      ));
      expect(backendCandidate?.verification).toEqual(["make lint", "make typecheck", "make test"]);
      const frontendCandidate = payload.data.candidates.find((candidate) => (
        candidate.files.some((file) => file.path.startsWith("frontend/"))
      ));
      expect(frontendCandidate?.verification).toEqual(["cd frontend && npm run test:run", "cd frontend && npm run build"]);
    });
  });

  test("scan synthesizes candidates by default even with legacy enabled false config", async () => {
    await withTempRepo(async (repo) => {
      await setupLegacyDisabledAcceptedSynthesis(repo);

      const result = await runCli([
        "scan",
        "--model",
        "gpt-test",
        "--effort",
        "high",
        "--timeout",
        "5",
        "--retries",
        "1",
        "--rpm",
        "7",
        "--concurrency",
        "2",
        "--token-budget",
        "1000",
        "--excerpt-budget",
        "0",
        "--privacy-mode",
        "metadata",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as AcceptedSynthesisScanPayload;
      const candidateId = expectAcceptedSynthesisScanPayload(payload);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as {
        rawCandidateCount: number;
        acceptedCandidateCount: number;
        reviewerRubricVersions?: Record<string, string>;
        validations: Array<{ status: string; candidateId?: string; readiness?: string }>;
      };
      expect(attempt.rawCandidateCount).toBe(1);
      expect(attempt.acceptedCandidateCount).toBe(1);
      expect(attempt.reviewerRubricVersions?.["architecture-deepening"]).toContain("beta-synthesis-quality");
      expect(attempt.validations[0]?.status).toBe("accepted");
      expect(attempt.validations[0]?.candidateId).toBe(candidateId);
      expect(attempt.validations[0]?.readiness).toBe("fix-ready");

      const explain = await runCli(["explain", candidateId, "--json"], repo);
      expect(explain.code).toBe(0);
      const explainPayload = JSON.parse(explain.stdout) as {
        data: {
          validation?: { status: string };
          synthesisAttempt?: { acceptedCandidateCount: number };
          fixReadiness?: { suggestedRegressionTest: string };
        };
      };
      expect(explainPayload.data.validation?.status).toBe("accepted");
      expect(explainPayload.data.synthesisAttempt?.acceptedCandidateCount).toBe(1);
      expect(explainPayload.data.fixReadiness?.suggestedRegressionTest).toContain("checkout");

      const report = await runCli(["report", "--json"], repo);
      const reportPayload = JSON.parse(report.stdout) as { data: { paths: { markdownPath: string } } };
      const markdown = await readFile(reportPayload.data.paths.markdownPath, "utf8");
      expect(markdown).toContain("Readiness: fix-ready");
      expect(markdown).toContain("Proof required:");
      expect(markdown).toContain("Owned files:");

      const handoff = await runCli(["handoff", candidateId, "--json"], repo);
      const handoffPayload = JSON.parse(handoff.stdout) as { data: { handoff: { content: string } } };
      expect(handoffPayload.data.handoff.content).toContain("Readiness: fix-ready");
      expect(handoffPayload.data.handoff.content).toContain("Proof required:");
      expect(handoffPayload.data.handoff.content).toContain("Owned files:");
    });
  });

  test("scan chunks broad whole-repo synthesis into scoped Codex packets", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await mkdir(path.join(repo, "src", "slices"), { recursive: true });
      for (let index = 0; index < 16; index += 1) {
        const body = Array.from({ length: 120 }, (_, line) => `  const value${line} = ${line + index};`).join("\n");
        await writeFile(path.join(repo, "src", "slices", `slice-${index}.ts`), `
export function slice${index}() {
${body}
  return value0;
}
`, "utf8");
      }
      const promptLog = path.join(repo, "prompts.jsonl");
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
const scope = JSON.parse(stdin.match(/Synthesis scope:\\n([\\s\\S]*?)\\n\\nCleanup surfaces:/)[1]);
const evidenceIds = [...stdin.matchAll(/"id": "(ev-[^"]+)"/g)].map((match) => match[1]);
fs.appendFileSync(${JSON.stringify(promptLog)}, JSON.stringify({ scope, evidenceIds }) + "\\n");
const firstPath = (stdin.match(/"path": "([^"]+\\.ts)"/) || [])[1] || "src/checkout.ts";
const outputIndex = process.argv.indexOf("-o");
const outputPath = process.argv[outputIndex + 1];
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: evidenceIds.length === 0 ? [] : [{
    title: "Scoped cleanup for " + scope.id,
    category: "architecture",
    priority: "P1",
    confidence: "high",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    readiness: "fix-ready",
    files: [{ path: firstPath, startLine: 1, endLine: 1 }],
    ownedFiles: [{ path: firstPath, startLine: 1, endLine: 1 }],
    contextFiles: [],
    evidenceIds: [evidenceIds[0]],
    whyItMatters: "Scoped synthesis keeps the cleanup work bounded.",
    likelyRootCause: "Whole-repo synthesis was previously too broad.",
    suggestedDirection: "Handle this packet as one bounded cleanup surface with non-goals.",
    expectedBehavior: "Current behavior remains unchanged.",
    proofRequired: ["Run the scoped regression checks."],
    nonGoals: ["Do not broaden beyond this synthesis packet."],
    doNotTouch: ["unrelated packets"],
    splitChildren: [],
    confidenceDowngradeReasons: [],
    verification: ["npm test"],
    fixReadiness: {
      minimumFixScope: "Keep the change inside the scoped packet.",
      suggestedRegressionTest: "Add or run the nearest scoped regression.",
      whyCurrentTestsMissIt: "Metric evidence alone does not prove the boundary.",
      confidenceDowngradeReasons: []
    },
    supportingQuotes: []
  }],
  rejectedEvidenceIds: [],
  notes: ["scope " + scope.id]
}));
`);

      const result = await runCli(["scan", "--token-budget", "1000", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as AcceptedSynthesisScanPayload;
      expect(payload.data.synthesis.requested).toBe(true);
      expect(payload.data.synthesis.candidateCount).toBeGreaterThan(1);

      const promptRecords = (await readFile(promptLog, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { scope: { id: string }; evidenceIds: string[] });
      expect(promptRecords.length).toBeGreaterThan(1);
      expect(new Set(promptRecords.map((record) => record.scope.id)).size).toBe(promptRecords.length);
      expect(promptRecords.every((record) => record.evidenceIds.length > 0)).toBe(true);

      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as {
        id: string;
        runtime: { synthesisMode?: string; chunkCount?: number; chunks?: Array<{ id: string; evidenceCount: number }> };
        validations: Array<{ id: string; candidateId?: string }>;
      };
      expect(attempt.id).toBe(payload.data.synthesis.attemptId);
      expect(attempt.runtime.synthesisMode).toBe("chunked");
      expect(attempt.runtime.chunkCount).toBe(promptRecords.length);
      expect(attempt.runtime.chunks?.every((chunk) => chunk.evidenceCount > 0)).toBe(true);
      expect(attempt.validations.every((validation) => validation.id.startsWith("chunk-"))).toBe(true);
      expect(payload.data.candidates
        .filter((candidate) => candidate.provenance.source === "model-synthesis")
        .every((candidate) => candidate.provenance.synthesisAttemptId === attempt.id)).toBe(true);
    });
  });

  test("evidence-only mode skips provider execution", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const marker = path.join(repo, "provider-invoked.txt");
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(marker)}, "called");
process.exit(0);
`);

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { synthesis: { requested: boolean; candidateCount: number; runtime: { offline: boolean } } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.synthesis.requested).toBe(false);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.data.synthesis.runtime.offline).toBe(true);
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "synthesis_skipped_by_policy")).toBe(true);
      await expect(stat(marker)).rejects.toThrow();
    });
  });

  test("offline mode skips provider execution and records a policy diagnostic", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const marker = path.join(repo, "provider-invoked.txt");
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(marker)}, "called");
process.exit(0);
`);

      const result = await runCli(["scan", "--synthesize", "--offline", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { synthesis: { requested: boolean; candidateCount: number; runtime: { offline: boolean } } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.synthesis.requested).toBe(false);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.data.synthesis.runtime.offline).toBe(true);
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "synthesis_skipped_by_policy")).toBe(true);
      await expect(stat(marker)).rejects.toThrow();
    });
  });

  test("provider unavailable failures leave durable diagnostics", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["init", "--json"], repo);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        reviewSynthesis: { command: string };
      };
      config.reviewSynthesis.command = path.join(repo, "missing-codex");
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const result = await runCli(["scan", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string }>;
        data: { evidenceCount: number; synthesis: { requested: boolean; candidateCount: number } };
      };
      expect(payload.data.evidenceCount).toBeGreaterThan(0);
      expect(payload.data.synthesis.requested).toBe(true);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "codex_provider_unavailable")).toBe(true);
    });
  });

  test("fix dry-run previews a patch without changing source", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const before = await readFile(path.join(repo, "src", "invoice.ts"), "utf8");
      const result = await runCli(["fix", prepared.candidateId, "--mode", "guarded", "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { attempt: { status: string; dryRun: boolean; changedFiles: string[] }; patchPreviewPath: string; externalSideEffects: unknown[] };
      };
      expect(payload.data.attempt.status).toBe("previewed");
      expect(payload.data.attempt.dryRun).toBe(true);
      expect(payload.data.attempt.changedFiles).toEqual(["src/invoice.ts"]);
      expect(payload.data.externalSideEffects).toEqual([]);
      await expect(stat(payload.data.patchPreviewPath)).resolves.toBeTruthy();
      expect(await readFile(path.join(repo, "src", "invoice.ts"), "utf8")).toBe(before);
    });
  });

  test("fix resolves safe narrow opportunity targets into candidate fix workflow", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const opportunityId = await writeFixOpportunity(repo, prepared.candidateId, "safe-narrow-pr");
      const result = await runCli(["fix", opportunityId, "--mode", "guarded", "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { attempt: { candidateId: string; status: string; dryRun: boolean } };
      };
      expect(payload.data.attempt.candidateId).toBe(prepared.candidateId);
      expect(payload.data.attempt.status).toBe("previewed");
      expect(payload.data.attempt.dryRun).toBe(true);
    });
  });

  test("fix refuses unsafe opportunity targets before mutation", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const opportunityId = await writeFixOpportunity(repo, prepared.candidateId, "tests-first");
      const result = await runCli(["fix", opportunityId, "--mode", "guarded", "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as {
        error: { code: string; message: string };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.error.code).toBe("opportunity_not_fixable");
      expect(payload.error.message).toContain("tests-first");
      expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "opportunity_refusal_reason")).toBe(true);
    });
  });

  test("fix refuses when fix execution is disabled in config", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      const result = await runCli(["fix", prepared.candidateId, "--mode", "guarded", "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string; message: string } };
      expect(payload.error.code).toBe("fix_execution_disabled");
      expect(payload.error.message).toContain("fixExecution.enabled");
    });
  });

  test("fix accepts only the guarded GA autofix mode", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const refused = await runCli(["fix", prepared.candidateId, "--mode", "experimental", "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(refused.code).toBe(2);
      const refusedPayload = JSON.parse(refused.stdout) as { error: { code: string } };
      expect(refusedPayload.error.code).toBe("unsupported_fix_mode");

      const missing = await runCli(["fix", prepared.candidateId, "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(missing.code).toBe(2);
      const missingPayload = JSON.parse(missing.stdout) as { error: { code: string } };
      expect(missingPayload.error.code).toBe("fix_mode_required");

      const guarded = await runCli(["fix", prepared.candidateId, "--mode", "guarded", "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(guarded.code).toBe(0);
      const guardedPayload = JSON.parse(guarded.stdout) as { data: { attempt: { status: string; dryRun: boolean } } };
      expect(guardedPayload.data.attempt.status).toBe("previewed");
      expect(guardedPayload.data.attempt.dryRun).toBe(true);
    });
  });

  test("fix PR mode requires an isolated branch", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--allow-source-mutation",
        "--verification",
        "test -f src/invoice.ts",
        "--pr",
        "--json",
      ], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string; message: string } };
      expect(payload.error.code).toBe("branch_required");
      expect(payload.error.message).toContain("--branch");
    });
  });

  test("fix applies a local patch and captures verification results without external side effects", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--allow-source-mutation",
        "--verification-command",
        "test -f src/invoice.ts",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: {
            status: string;
            dryRun: boolean;
            noExternalSideEffects?: boolean;
            dirtyBefore?: string[];
            dirtyAfter?: string[];
            verificationResults: Array<{
              passed: boolean;
              outputPath?: string;
              durationMs?: number;
              summary?: string;
            }>;
          };
          externalSideEffects: unknown[];
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.dryRun).toBe(false);
      expect(payload.data.attempt.verificationResults[0]?.passed).toBe(true);
      expect(payload.data.attempt.verificationResults[0]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(payload.data.attempt.verificationResults[0]?.summary).toBeDefined();
      expect(payload.data.attempt.noExternalSideEffects).toBe(true);
      expect(payload.data.attempt.dirtyBefore).toContain("fix.patch");
      expect(payload.data.attempt.dirtyAfter).toContain("src/invoice.ts");
      expect(payload.data.externalSideEffects).toEqual([]);
      expect(await readFile(path.join(repo, "src", "invoice.ts"), "utf8")).toContain("deepclean fix applied");
      await expect(stat(payload.data.attempt.verificationResults[0]?.outputPath ?? "")).resolves.toBeTruthy();
    });
  });

  test("fix proof commands can resolve executables from repo-local virtualenv bin", async () => {
    await withTempRepo(async (repo) => {
      await mkdir(path.join(repo, ".venv", "bin"), { recursive: true });
      const proofCommand = path.join(repo, ".venv", "bin", "repo-local-proof");
      await writeFile(proofCommand, `#!/bin/sh
grep -q "deepclean fix applied" src/invoice.ts
`, "utf8");
      await chmod(proofCommand, 0o755);
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);

      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--allow-source-mutation",
        "--verification-command",
        "repo-local-proof",
        "--json",
      ], repo);

      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: {
            status: string;
            verificationResults: Array<{ command: string; passed: boolean }>;
          };
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.verificationResults[0]).toMatchObject({
        command: "repo-local-proof",
        passed: true,
      });
    });
  });

  test("fix runs every repeated verification flag", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--verification",
        "grep -q 'deepclean fix applied' src/invoice.ts",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: {
            status: string;
            verificationCommands: string[];
            verificationResults: Array<{ command: string; passed: boolean; outputPath?: string }>;
          };
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.verificationCommands).toEqual([
        "test -f src/invoice.ts",
        "grep -q 'deepclean fix applied' src/invoice.ts",
      ]);
      expect(payload.data.attempt.verificationResults.map((result) => result.command)).toEqual([
        "test -f src/invoice.ts",
        "grep -q 'deepclean fix applied' src/invoice.ts",
      ]);
      expect(payload.data.attempt.verificationResults.every((result) => result.passed)).toBe(true);
      await expect(stat(payload.data.attempt.verificationResults[0]?.outputPath ?? "")).resolves.toBeTruthy();
      await expect(stat(payload.data.attempt.verificationResults[1]?.outputPath ?? "")).resolves.toBeTruthy();
    });
  });

  test("fix creates a requested local branch before applying", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--branch",
        "chore/deepclean-safe-fix",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { attempt: { branch?: string; status: string } };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.branch).toBe("chore/deepclean-safe-fix");
      const branch = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo });
      expect(branch.stdout.trim()).toBe("chore/deepclean-safe-fix");
    });
  });

  test("fix refuses dirty files outside target scope", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      await writeFile(path.join(repo, "outside.ts"), "export const outside = true;\n", "utf8");
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--allow-source-mutation",
        "--verification-command",
        "true",
        "--json",
      ], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string } };
      expect(payload.error.code).toBe("dirty_tree");
    });
  });

  test("fix records scope-failed attempts when worker edits outside allowed files", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
fs.readFileSync(0, "utf8");
fs.writeFileSync("outside.ts", "export const outside = true;\\n");
`);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--apply",
        "--verification",
        "true",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(3);
      const payload = JSON.parse(result.stdout) as {
        data: { attempt: { status: string; outcome?: string; outOfScopeFiles?: string[]; verificationResults: unknown[] } };
      };
      expect(payload.data.attempt.status).toBe("scope-failed");
      expect(payload.data.attempt.outcome).toBe("needs_human");
      expect(payload.data.attempt.outOfScopeFiles).toContain("outside.ts");
      expect(payload.data.attempt.verificationResults).toEqual([]);
      const eventFiles = await readdir(path.join(repo, ".deepclean", "lifecycle"));
      const events = await Promise.all(eventFiles.map(async (file) => (
        JSON.parse(await readFile(path.join(repo, ".deepclean", "lifecycle", file), "utf8")) as { kind: string }
      )));
      expect(events.some((event) => event.kind === "scope-failed")).toBe(true);
    });
  });

  test("fix captures failed verification output without marking the attempt verified", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--verification",
        "echo nope && exit 7",
        "--json",
      ], repo);
      expect(result.code).toBe(3);
      const payload = JSON.parse(result.stdout) as {
        data: { attempt: { status: string; verificationResults: Array<{ passed: boolean; exitCode?: number; summary?: string; durationMs?: number; outputPath?: string }> } };
      };
      expect(payload.data.attempt.status).toBe("failed");
      expect(payload.data.attempt.verificationResults[0]?.passed).toBe(false);
      expect(payload.data.attempt.verificationResults[0]?.exitCode).toBe(7);
      expect(payload.data.attempt.verificationResults[0]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(payload.data.attempt.verificationResults[0]?.summary).toContain("nope");
      await expect(stat(payload.data.attempt.verificationResults[0]?.outputPath ?? "")).resolves.toBeTruthy();
    });
  });

  test("fix can invoke a bounded local Codex patch worker without an explicit patch file", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const prompt = fs.readFileSync(0, "utf8");
if (prompt.includes("Verification commands the final patch must satisfy")) {
  process.stderr.write("worker prompt asks Codex to own verification");
  process.exit(42);
}
if (!prompt.includes("Do not run test, build, typecheck, package, npm install, or verification commands.")) {
  process.stderr.write("worker prompt does not forbid verification commands");
  process.exit(43);
}
const target = "src/invoice.ts";
const source = fs.readFileSync(target, "utf8");
fs.writeFileSync(target, source.replace("export function", "// worker fix applied\\nexport function"));
`);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: {
            status: string;
            outcome?: string;
            worker?: { provider: string; outputPath?: string };
            changedFiles: string[];
            allowedWriteScope?: string[];
          };
          externalSideEffects: unknown[];
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.outcome).toBe("partially-resolved");
      expect(payload.data.attempt.worker?.provider).toBe("codex");
      expect(payload.data.attempt.changedFiles).toEqual(["src/invoice.ts"]);
      expect(payload.data.attempt.allowedWriteScope).toContain("src/invoice.ts");
      expect(payload.data.externalSideEffects).toEqual([]);
      await expect(stat(payload.data.attempt.worker?.outputPath ?? "")).resolves.toBeTruthy();
      expect(await readFile(path.join(repo, "src", "invoice.ts"), "utf8")).toContain("worker fix applied");
    });
  });

  test("fix ignores stale plans from prior runs with reused candidate ids", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);

      const plansDir = path.join(repo, ".deepclean", "plans");
      for (const file of await readdir(plansDir)) {
        await rm(path.join(plansDir, file), { force: true });
      }
      await writeFile(path.join(plansDir, "stale-plan.json"), `${JSON.stringify({
        schemaVersion,
        recordType: "plan",
        id: "stale-plan",
        runId: "run-stale",
        targetType: "candidate",
        targetId: prepared.candidateId,
        title: "Stale plan",
        summary: "Stale plan",
        steps: [],
        constraints: [],
        verification: [],
        createdAt: "2999-01-01T00:00:00.000Z",
        content: "STALE PLAN SHOULD NOT BE USED",
      }, null, 2)}\n`, "utf8");

      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const prompt = fs.readFileSync(0, "utf8");
if (prompt.includes("STALE PLAN SHOULD NOT BE USED")) {
  process.stderr.write("stale plan reused");
  process.exit(42);
}
const target = "src/invoice.ts";
const source = fs.readFileSync(target, "utf8");
fs.writeFileSync(target, source.replace("export function", "// fresh plan worker fix applied\\nexport function"));
`);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { planPath: string; attempt: { planId: string; status: string; changedFiles: string[] } };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.planId).not.toBe("stale-plan");
      expect(path.basename(payload.data.planPath)).not.toBe("stale-plan.json");
      const plan = JSON.parse(await readFile(payload.data.planPath, "utf8")) as { runId: string; targetId: string; content: string };
      expect(plan.runId).toBe((await latestRunFile(repo)).replace(/\.json$/, ""));
      expect(plan.targetId).toBe(prepared.candidateId);
      expect(plan.content).not.toContain("STALE PLAN SHOULD NOT BE USED");
      expect(payload.data.attempt.changedFiles).toEqual(["src/invoice.ts"]);
    });
  });

  test("fix continues after an idle worker timeout when in-scope work landed", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await configureFixWorkerTimeouts(repo, { idleTimeoutMs: 500, hardTimeoutMs: 2000 });
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
fs.readFileSync(0, "utf8");
const target = "src/invoice.ts";
const source = fs.readFileSync(target, "utf8");
fs.writeFileSync(target, source.replace("export function", "// worker timeout fix applied\\nexport function"));
setInterval(() => {
  process.stdout.write("still working after patch\\n");
}, 50);
`);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: {
            status: string;
            worker?: { timedOut?: boolean; timeoutReason?: string };
            diagnostics: Array<{ level: string; code: string }>;
            changedFiles: string[];
          };
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.worker?.timedOut).toBe(true);
      expect(payload.data.attempt.worker?.timeoutReason).toBe("idle");
      expect(payload.data.attempt.changedFiles).toEqual(["src/invoice.ts"]);
      expect(payload.data.attempt.diagnostics.map((item) => item.code)).toContain("fix_worker_idle_timeout");
      expect(payload.data.attempt.diagnostics.map((item) => item.code)).toContain("fix_worker_timeout_recovered");
      expect(await readFile(path.join(repo, "src", "invoice.ts"), "utf8")).toContain("worker timeout fix applied");
    });
  });

  test("fix fails after an idle worker timeout when no work landed", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await configureFixWorkerTimeouts(repo, { idleTimeoutMs: 25, hardTimeoutMs: 500 });
      await installFakeCodex(repo, `#!/usr/bin/env node
process.stdin.resume();
setInterval(() => {}, 1000);
`);
      const result = await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(3);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: {
            status: string;
            worker?: { timedOut?: boolean; timeoutReason?: string };
            diagnostics: Array<{ level: string; code: string }>;
            changedFiles: string[];
          };
        };
      };
      expect(payload.data.attempt.status).toBe("failed");
      expect(payload.data.attempt.worker?.timedOut).toBe(true);
      expect(payload.data.attempt.worker?.timeoutReason).toBe("idle");
      expect(payload.data.attempt.changedFiles).toEqual([]);
      expect(payload.data.attempt.diagnostics.map((item) => item.code)).toContain("fix_worker_idle_timeout");
      expect(payload.data.attempt.diagnostics.map((item) => item.code)).toContain("fix_no_changed_files");
    });
  });

  test("work refuses before branch creation when fix execution is disabled in config", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      const branchBefore = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo });
      const result = await runCli([
        "work",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--branch",
        "chore/deepclean-candidate-001",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--verification",
        "true",
        "--json",
      ], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string } };
      expect(payload.error.code).toBe("fix_execution_disabled");
      const branchAfter = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo });
      expect(branchAfter.stdout.trim()).toBe(branchBefore.stdout.trim());
    });
  });

  test("work requires the guarded GA autofix mode", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const missing = await runCli([
        "work",
        prepared.candidateId,
        "--branch",
        "chore/deepclean-missing-mode",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--verification",
        "true",
        "--json",
      ], repo);
      expect(missing.code).toBe(2);
      const payload = JSON.parse(missing.stdout) as { error: { code: string } };
      expect(payload.error.code).toBe("fix_mode_required");
    });
  });

  test("split decomposes a broad parent candidate into child candidates", async () => {
    await withTempRepo(async (repo) => {
      const parent = await prepareSplittableCandidate(repo);
      const result = await runCli(["split", parent.id, "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          parent: { id: string; status: string; decomposition?: { childCandidateIds?: string[]; strategy: string } };
          children: Array<{ id: string; decomposition?: { parentCandidateId?: string; sequence?: number; total?: number }; provenance: { source: string } }>;
          strategy: string;
          childCandidateIds: string[];
        };
      };
      expect(payload.data.parent.status).toBe("superseded");
      expect(payload.data.strategy).toBe("large-function-slices");
      expect(payload.data.children.length).toBeGreaterThan(1);
      expect(payload.data.childCandidateIds).toEqual(payload.data.children.map((child) => child.id));
      for (const [index, child] of payload.data.children.entries()) {
        expect(child.provenance.source).toBe("candidate-decomposition");
        expect(child.decomposition?.parentCandidateId).toBe(parent.id);
        expect(child.decomposition?.sequence).toBe(index + 1);
        expect(child.decomposition?.total).toBe(payload.data.children.length);
      }

      const candidateFile = path.join(repo, ".deepclean", "candidates", await latestRunFile(repo));
      const candidates = JSON.parse(await readFile(candidateFile, "utf8")) as CandidateRecord[];
      const persistedParent = candidates.find((candidate) => candidate.id === parent.id);
      expect(persistedParent?.status).toBe("superseded");
      expect(candidates.filter((candidate) => candidate.decomposition?.parentCandidateId === parent.id)).toHaveLength(payload.data.children.length);

      const findingFiles = await readdir(path.join(repo, ".deepclean", "findings"));
      const findings = await Promise.all(findingFiles.map(async (file) => (
        JSON.parse(await readFile(path.join(repo, ".deepclean", "findings", file), "utf8")) as FindingRecord
      )));
      expect(findings.some((finding) => finding.decomposition?.parentCandidateId === parent.id)).toBe(true);

      const secondResult = await runCli(["split", parent.id, "--json"], repo);
      expect(secondResult.code).toBe(0);
      const secondPayload = JSON.parse(secondResult.stdout) as { data: { parent: { status: string }; childCandidateIds: string[] } };
      expect(secondPayload.data.parent.status).toBe("superseded");
      expect(secondPayload.data.childCandidateIds).toEqual(payload.data.childCandidateIds);
    });
  });

  test("status surfaces progress from existing lifecycle and fix artifacts", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      await runCli([
        "fix",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--patch",
        prepared.patchPath,
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--json",
      ], repo);
      const parent = await prepareSplittableCandidate(repo);
      await runCli(["split", parent.id, "--json"], repo);
      await writeFile(path.join(repo, ".deepclean", "revalidations", "revalidation-fitness-progress.json"), `${JSON.stringify({
        schemaVersion,
        recordType: "revalidation",
        id: "revalidation-fitness-progress",
        targetType: "finding",
        targetId: prepared.findingId,
        runId: "run-progress",
        outcome: "partially-resolved",
        confidence: "medium",
        rationale: "Fixture progress.",
        nextAction: "Continue the campaign.",
        evidenceIds: ["ev-before", "ev-after"],
        verificationRunIds: [],
        changedFiles: [],
        progress: {
          kind: "metric-reduction",
          metric: "dependency-hotspot.incoming",
          unit: "dependencies",
          before: 12,
          after: 8,
          delta: 4,
          evidenceIds: ["ev-before", "ev-after"],
        },
        diagnostics: [],
        createdAt: "2026-05-24T00:00:00.000Z",
      }, null, 2)}\n`, "utf8");

      const result = await runCli(["status", "--progress-events", "50", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          progress: {
            net: string;
            fixes: { attempts: number; verificationPassed: number; changedFiles: string[] };
            splits: { parents: number; children: number; parentCandidateIds: string[] };
            fitnessDeltas: Array<{ metric: string; before: number; after: number; delta: number }>;
            notes: string[];
          };
        };
      };
      expect(payload.data.progress.net).toBe("positive");
      expect(payload.data.progress.fixes.attempts).toBeGreaterThan(0);
      expect(payload.data.progress.fixes.verificationPassed).toBeGreaterThan(0);
      expect(payload.data.progress.fixes.changedFiles).toContain("src/invoice.ts");
      expect(payload.data.progress.splits.parents).toBeGreaterThan(0);
      expect(payload.data.progress.splits.children).toBeGreaterThan(0);
      expect(payload.data.progress.splits.parentCandidateIds).toContain(parent.id);
      expect(payload.data.progress.fitnessDeltas[0]).toMatchObject({
        metric: "dependency-hotspot.incoming",
        before: 12,
        after: 8,
        delta: 4,
      });

      const human = await runCli(["status", "--progress-events", "50"], repo);
      expect(human.stdout).toContain("progress: positive");
      expect(human.stdout).toContain("fixes:");
      expect(human.stdout).toContain("advanced:");
      expect(human.stdout).toContain("fitness: dependency-hotspot.incoming 12->8 dependencies");
    });
  });

  test("work refuses broad parent candidates before branch creation", async () => {
    await withTempRepo(async (repo) => {
      const parent = await prepareSplittableCandidate(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "work",
        parent.id,
        "--mode",
        "guarded",
        "--branch",
        "chore/deepclean-broad-parent",
        "--apply",
        "--verification",
        "true",
        "--json",
      ], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string; message: string } };
      expect(payload.error.code).toBe("fix_target_needs_split");
      expect(payload.error.message).toContain(`deepclean split ${parent.id}`);
    });
  });

  test("work prepares a PR-ready summary when revalidation no longer finds the candidate", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
fs.readFileSync(0, "utf8");
const target = "src/invoice.ts";
fs.writeFileSync(target, \`
export function calculateInvoice(items, coupon) {
  return { subtotal: items.length, discount: coupon ? 1 : 0, tax: 0, total: items.length };
}
\`);
`);
      const result = await runCli([
        "work",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--branch",
        "chore/deepclean-candidate-001",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--no-pr",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: { status: string; outcome?: string; pr?: { externalSideEffects: unknown[] } };
          revalidation?: { outcome: string };
          prSummaryPath?: string;
          externalSideEffects: unknown[];
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.outcome).toBe("resolved");
      expect(payload.data.revalidation?.outcome).toBe("resolved");
      expect(payload.data.prSummaryPath).toBeDefined();
      expect(payload.data.externalSideEffects).toEqual([]);
      expect(payload.data.attempt.pr?.externalSideEffects).toEqual([]);
      const branch = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo });
      expect(branch.stdout.trim()).toBe("chore/deepclean-candidate-001");
    });
  });

  test("work retries a still-open candidate with remaining evidence feedback", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const prompt = fs.readFileSync(0, "utf8");
const target = "src/invoice.ts";
const source = fs.readFileSync(target, "utf8");
if (prompt.includes("Attempt: 1 of")) {
  fs.writeFileSync(target, source.replace("export function", "// first attempt only touched one symptom\\nexport function"));
} else {
  if (!prompt.includes("Previous attempts") || !prompt.includes("still-open")) {
    process.stderr.write("missing retry context");
    process.exit(1);
  }
  fs.writeFileSync(target, \`
export function calculateInvoice(items, coupon) {
  return { subtotal: items.length, discount: coupon ? 1 : 0, tax: 0, total: items.length };
}
\`);
}
`);
      const result = await runCli([
        "work",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--branch",
        "chore/deepclean-retry-candidate-001",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--no-pr",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: { status: string; outcome?: string; attemptNumber?: number; maxAttempts?: number };
          attempts: Array<{ id: string; status: string; outcome?: string; attemptNumber?: number }>;
          revalidation?: { outcome: string };
          prSummaryPath?: string;
        };
      };
      expect(payload.data.attempts).toHaveLength(2);
      expect(payload.data.attempts[0]?.outcome).toBe("still-open");
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.outcome).toBe("resolved");
      expect(payload.data.attempt.attemptNumber).toBe(2);
      expect(payload.data.attempt.maxAttempts).toBe(3);
      expect(payload.data.revalidation?.outcome).toBe("resolved");
      expect(payload.data.prSummaryPath).toBeDefined();
    });
  });

  test("work stops retrying when a follow-up attempt only touches file metadata", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const prompt = fs.readFileSync(0, "utf8");
const target = "src/invoice.ts";
const source = fs.readFileSync(target, "utf8");
if (prompt.includes("Attempt: 1 of")) {
  fs.writeFileSync(target, source.replace("export function", "// first attempt only touched one symptom\\nexport function"));
} else {
  const now = new Date();
  fs.utimesSync(target, now, now);
}
`);
      const result = await runCli([
        "work",
        prepared.candidateId,
        "--mode",
        "guarded",
        "--branch",
        "chore/deepclean-retry-no-progress",
        "--apply",
        "--verification",
        "test -f src/invoice.ts",
        "--no-pr",
        "--allow-dirty",
        "--json",
      ], repo);
      expect(result.code).toBe(3);
      const payload = JSON.parse(result.stdout) as {
        data: {
          attempt: { status: string; outcome?: string; diagnostics?: Array<{ code: string }> };
          attempts: Array<{ id: string; status: string; outcome?: string; diagnostics?: Array<{ code: string }> }>;
        };
      };
      expect(payload.data.attempts).toHaveLength(2);
      expect(payload.data.attempt.status).toBe("failed");
      expect(payload.data.attempt.outcome).toBe("needs_human");
      expect(payload.data.attempt.diagnostics?.some((diagnostic) => diagnostic.code === "fix_no_retry_progress")).toBe(true);
    });
  });

  test("respects configurable local candidate caps", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["init", "--json"], repo);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        candidateCaps: { byKind: Record<string, number> };
      };
      config.candidateCaps.byKind["duplicate-cluster"] = 0;
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { candidates: Array<{ category: string }> };
      };
      expect(payload.data.candidates.some((candidate) => candidate.category === "duplication")).toBe(false);
    });
  });

  test("candidate scoring downgrades stable utility fan-in hotspots", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-utility",
        kind: "dependency-hotspot",
        title: "Dependency hotspot: src/ids.ts",
        files: [{ path: "src/ids.ts" }],
        data: {
          incoming: 18,
          outgoing: 0,
          imports: [],
          importedBy: Array.from({ length: 18 }, (_, index) => `src/caller-${index}.ts`),
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.readiness).toBe("defer");
    expect(candidates[0]?.risk).toBe("safe");
  });

  test("candidate scoring downgrades compatibility type barrels", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-types-barrel",
        kind: "dependency-hotspot",
        title: "Dependency hotspot: src/types.ts",
        files: [{ path: "src/types.ts" }],
        data: {
          incoming: 19,
          outgoing: 9,
          imports: [
            "src/defaults.ts",
            "src/file-references.ts",
            "src/json.ts",
            "src/type-kinds.ts",
            "src/evidence-types.ts",
            "src/candidate-types.ts",
            "src/finding-types.ts",
            "src/operation-types.ts",
            "src/reporting-types.ts",
          ],
          importedBy: Array.from({ length: 19 }, (_, index) => `src/caller-${index}.ts`),
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.readiness).toBe("defer");
    expect(candidates[0]?.risk).toBe("safe");
  });

  test("candidate scoring keeps mixed dependency hotspots actionable", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-mixed",
        kind: "dependency-hotspot",
        title: "Dependency hotspot: src/cli.ts",
        files: [{ path: "src/cli.ts" }],
        data: {
          incoming: 8,
          outgoing: 16,
          imports: Array.from({ length: 16 }, (_, index) => `src/dependency-${index}.ts`),
          importedBy: Array.from({ length: 8 }, (_, index) => `src/caller-${index}.ts`),
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P1");
    expect(candidates[0]?.risk).toBe("design-needed");
  });

  test("candidate scoring treats CLI entrypoint fan-out as context", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-cli-entrypoint",
        kind: "dependency-hotspot",
        title: "Dependency hotspot: src/cli.ts",
        files: [{ path: "src/cli.ts" }],
        data: {
          incoming: 0,
          outgoing: 21,
          imports: Array.from({ length: 21 }, (_, index) => `src/dependency-${index}.ts`),
          importedBy: [],
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.readiness).toBe("split-needed");
    expect(candidates[0]?.risk).toBe("moderate");
  });

  test("candidate scoring downgrades large test-suite pressure", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-large-test",
        kind: "large-file",
        title: "Large source file: src/cli.test.ts",
        files: [{ path: "src/cli.test.ts" }],
        data: {
          nonBlankLines: 2200,
          totalLines: 4100,
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.readiness).toBe("split-needed");
    expect(candidates[0]?.risk).toBe("moderate");
  });

  test("candidate scoring keeps oversized CLI entrypoints as split campaigns", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-large-cli",
        kind: "large-file",
        title: "Large source file: src/cli.ts",
        files: [{ path: "src/cli.ts" }],
        data: {
          nonBlankLines: 3600,
          totalLines: 6600,
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.readiness).toBe("split-needed");
    expect(candidates[0]?.effort).toBe("large");
  });

  test("candidate scoring treats churn-only findings as context", () => {
    const candidates = candidatesFromEvidence("run-test", [
      evidenceFixture({
        id: "ev-churn",
        kind: "churn-hotspot",
        title: "High churn file: src/cli.ts",
        files: [{ path: "src/cli.ts" }],
        data: {
          commits: 16,
          changedLines: 1200,
        },
        confidence: "high",
      }),
    ], "2026-05-24T00:00:00.000Z");

    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.readiness).toBe("defer");
    expect(candidates[0]?.risk).toBe("safe");
  });

  test("ingests SARIF findings from external analyzers", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await writeFile(path.join(repo, "semgrep.sarif"), JSON.stringify({
        version: "2.1.0",
        runs: [{
          tool: { driver: { name: "Semgrep" } },
          results: [{
            ruleId: "maintainability.example",
            level: "warning",
            message: { text: "Duplicated validation path should be reviewed" },
            locations: [{
              physicalLocation: {
                artifactLocation: { uri: "src/checkout.ts" },
                region: { startLine: 2, endLine: 8 },
              },
            }],
          }],
        }],
      }), "utf8");

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { candidates: Array<{ category: string; title: string }> };
      };
      expect(payload.data.candidates.some((candidate) => (
        candidate.category === "diagnostic"
        && candidate.title.includes("Duplicated validation path")
      ))).toBe(true);
    });
  });

  test("resolves TS ESM .js specifiers to local source graph edges", async () => {
    await withTempRepo(async (repo) => {
      await mkdir(path.join(repo, "src", "utils"), { recursive: true });
      await writeFile(path.join(repo, "src", "index.ts"), `
import { buildThing } from "./types.js";
export { helper } from "./utils/index.js";
export async function loadFeature() {
  return import("./feature.js");
}
export const value = buildThing();
`, "utf8");
      await writeFile(path.join(repo, "src", "types.ts"), "export function buildThing() { return 'ok'; }\n", "utf8");
      await writeFile(path.join(repo, "src", "feature.ts"), "export const feature = true;\n", "utf8");
      await writeFile(path.join(repo, "src", "utils", "index.ts"), "export const helper = 1;\n", "utf8");

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as { data: { runId: string } };
      const evidence = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "evidence", `${payload.data.runId}.json`), "utf8"),
      ) as Array<{ kind: string; data: { edgeCount?: number; edges?: Array<{ from: string; to: string }> } }>;
      const graph = evidence.find((record) => record.kind === "code-graph-summary");
      expect(graph?.data.edgeCount).toBeGreaterThanOrEqual(3);
      expect(graph?.data.edges).toContainEqual({ from: "src/index.ts", to: "src/types.ts" });
      expect(graph?.data.edges).toContainEqual({ from: "src/index.ts", to: "src/feature.ts" });
      expect(graph?.data.edges).toContainEqual({ from: "src/index.ts", to: "src/utils/index.ts" });
    });
  });

  test("reports unavailable configured Semgrep without dropping local evidence", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["init", "--json"], repo);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        externalAnalyzers: { semgrep: { enabled: boolean; command: string } };
      };
      config.externalAnalyzers.semgrep.enabled = true;
      config.externalAnalyzers.semgrep.command = "deepclean-missing-semgrep";
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const result = await runCli(["scan", "--evidence-only", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { evidenceCount: number };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.evidenceCount).toBeGreaterThan(0);
      expect(payload.diagnostics.some((item) => item.code === "semgrep_unavailable")).toBe(true);
    });
  });

  test("report recommendation queue prefers synthesized findings over weak metric findings", () => {
    const metric = candidateFixture({
      id: "candidate-001",
      priority: "P1",
      category: "complexity",
      confidence: "medium",
      provenance: { source: "local-evidence" },
    });
    const synthesized = candidateFixture({
      id: "candidate-002",
      priority: "P2",
      category: "architecture",
      confidence: "high",
      provenance: { source: "model-synthesis", provider: "codex" },
    });

    const report = buildReportRecord("run-test", [metric, synthesized], []);
    expect(report.recommendations?.topCandidateIds[0]).toBe("candidate-002");
    expect(report.recommendations?.startHere?.id).toBe("candidate-002");
  });

  test("candidate plans dedupe repeated file references", () => {
    const candidate = candidateFixture({
      files: [
        { path: "src/example.ts", startLine: 1, endLine: 20 },
        { path: "src/example.ts", startLine: 1, endLine: 20 },
      ],
    });
    const plan = buildCandidatePlan("run-test", candidate, []);
    expect(plan.steps[0]?.files).toHaveLength(1);
    expect(plan.steps.at(-1)?.verification).toContain("deepclean scan");
    expect(plan.steps.at(-1)?.verification).not.toContain("deepclean scan --synthesize");
    expect(plan.content).toContain("Slice Queue:");
    expect(plan.content).toContain("Stop line:");
    expect(plan.content).toContain("Non-goals:");
  });

  test("candidate plans render feature boundaries", () => {
    const candidate = candidateFixture({
      affectedFeatureIds: ["feature-checkout"],
      featureScope: "feature-local",
    });
    const feature = featureFixture({
      featureId: "feature-checkout",
      title: "Checkout",
      entrypoints: [{ path: "src/checkout.ts" }],
      ownedFiles: [{ path: "src/checkout.ts" }],
      contextFiles: [{ path: "src/money.ts" }],
      testFiles: [{ path: "src/checkout.test.ts" }],
    });
    const plan = buildCandidatePlan("run-test", candidate, [], [feature]);
    expect(plan.content).toContain("Feature Boundary:");
    expect(plan.content).toContain("Checkout");
    expect(plan.content).toContain("src/checkout.test.ts");
  });

  test("marks broad themes as too broad and blocks agent-ready plans", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["init", "--json"], repo);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        clusters: { maxFiles: number };
      };
      config.clusters.maxFiles = 1;
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      await runCli(["scan", "--evidence-only", "--json"], repo);
      const result = await runCli(["cluster", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { clusters: Array<{ id: string; actionability?: string; warnings?: string[] }> };
      };
      expect(payload.data.clusters[0]?.actionability).toBe("too-broad");
      expect(payload.data.clusters[0]?.warnings?.length).toBeGreaterThan(0);

      const plan = await runCli(["plan", payload.data.clusters[0]?.id ?? "theme-001", "--json"], repo);
      expect(plan.code).toBe(2);
      const planPayload = JSON.parse(plan.stdout) as { error: { code: string } };
      expect(planPayload.error.code).toBe("theme_too_broad");
    });
  });

  test("scan rejects synthesized candidates without supported evidence", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const outputPath = process.argv[process.argv.indexOf("-o") + 1];
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: [{
    title: "Unsupported model candidate",
    category: "architecture",
    priority: "P2",
    confidence: "medium",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    readiness: "fix-ready",
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    contextFiles: [],
    evidenceIds: ["ev-not-present"],
    whyItMatters: "This should not persist.",
    likelyRootCause: "Unsupported evidence.",
    suggestedDirection: "Reject it.",
    expectedBehavior: "No persisted candidate.",
    proofRequired: ["Valid evidence must support the candidate."],
    nonGoals: ["Do not accept unsupported model output."],
    doNotTouch: ["source files"],
    splitChildren: [],
    confidenceDowngradeReasons: ["No cited evidence is present."],
    verification: ["npm test"],
    fixReadiness: {
      minimumFixScope: "No fix should run.",
      suggestedRegressionTest: "No regression test.",
      whyCurrentTestsMissIt: "Unsupported evidence.",
      confidenceDowngradeReasons: ["No cited evidence is present."]
    },
    supportingQuotes: []
  }],
  rejectedEvidenceIds: [],
  notes: []
}));
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { runId: string; synthesis: { candidateCount: number; rejectedCandidateCount?: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.data.synthesis.rejectedCandidateCount).toBe(1);
      expect(payload.diagnostics.some((item) => item.code === "synthesis_candidate_without_evidence")).toBe(true);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { rejectedCandidateCount: number; validations: Array<{ status: string; diagnostics: Array<{ code: string }> }> };
      expect(attempt.rejectedCandidateCount).toBe(1);
      expect(attempt.validations[0]?.status).toBe("rejected");
      expect(attempt.validations[0]?.diagnostics[0]?.code).toBe("synthesis_candidate_without_evidence");
    });
  });

  test("scan continues past rejected synthesized drafts until the accepted limit is reached", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
const evidenceIds = [...stdin.matchAll(/"id": "(ev-[^"]+)"/g)].map((match) => match[1]);
const outputPath = process.argv[process.argv.indexOf("-o") + 1];
const validCandidate = {
  title: "Valid pricing cleanup after rejected draft",
  category: "duplication",
  priority: "P2",
  confidence: "medium",
  impact: "feature",
  effort: "medium",
  risk: "moderate",
  readiness: "fix-ready",
  files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
  ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
  contextFiles: [],
  evidenceIds,
  whyItMatters: "The valid candidate should still be considered after an invalid draft.",
  likelyRootCause: "The model produced one unsupported draft before a supported one.",
  suggestedDirection: "Keep validating drafts until the accepted candidate budget is filled.",
  expectedBehavior: "Rejected drafts do not consume the accepted candidate budget.",
  proofRequired: ["Accepted count reaches the configured limit."],
  nonGoals: ["Do not accept unsupported drafts."],
  doNotTouch: ["source files"],
  splitChildren: [],
  confidenceDowngradeReasons: [],
  verification: ["npm test"],
  fixReadiness: {
    minimumFixScope: "No source change needed for this fixture.",
    suggestedRegressionTest: "Assert accepted candidates are counted after rejected drafts.",
    whyCurrentTestsMissIt: "Existing tests only cover a single rejected draft.",
    confidenceDowngradeReasons: []
  },
  supportingQuotes: []
};
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: [{
    ...validCandidate,
    title: "Unsupported draft before valid candidate",
    evidenceIds: ["ev-not-present"],
    whyItMatters: "This draft should be rejected before the valid candidate is considered."
  }, validCandidate],
  rejectedEvidenceIds: [],
  notes: []
}));
`);
      const configPath = path.join(repo, ".deepclean", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        reviewSynthesis: { maxCandidates: number };
      };
      config.reviewSynthesis.maxCandidates = 1;
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          runId: string;
          synthesis: { candidateCount: number; acceptedCandidateCount?: number; rejectedCandidateCount?: number };
          candidates: Array<{ id: string; title: string }>;
        };
      };
      expect(payload.data.synthesis.candidateCount).toBe(1);
      expect(payload.data.synthesis.acceptedCandidateCount).toBe(1);
      expect(payload.data.synthesis.rejectedCandidateCount).toBe(1);
      expect(payload.data.candidates[0]?.title).toBe("Valid pricing cleanup after rejected draft");
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { validations: Array<{ status: string; candidateId?: string }> };
      expect(attempt.validations.map((item) => item.status)).toEqual(["rejected", "accepted"]);
      expect(attempt.validations[1]?.candidateId).toBe(payload.data.candidates[0]?.id);
    });
  });

  test("scan downgrades broad synthesized candidates without safe slices", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
const evidenceIds = [...stdin.matchAll(/"id": "(ev-[^"]+)"/g)].map((match) => match[1]);
const outputPath = process.argv[process.argv.indexOf("-o") + 1];
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: [{
    title: "Repo-wide pricing cleanup needs design",
    category: "architecture",
    priority: "P1",
    confidence: "high",
    impact: "cross-cutting",
    effort: "large",
    risk: "moderate",
    readiness: "split-needed",
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }, { path: "src/invoice.ts", startLine: 1, endLine: 1 }],
    ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    contextFiles: [{ path: "src/invoice.ts", startLine: 1, endLine: 1 }],
    evidenceIds,
    whyItMatters: "The model found a real but broad pricing concern.",
    likelyRootCause: "Pricing behavior lacks a named boundary.",
    suggestedDirection: "Design bounded pricing slices before editing.",
    expectedBehavior: "Pricing output remains unchanged.",
    proofRequired: ["A bounded child slice has its own regression proof."],
    nonGoals: ["Do not rewrite all pricing callers at once."],
    doNotTouch: ["unrelated checkout flows"],
    splitChildren: [],
    confidenceDowngradeReasons: [],
    verification: ["npm test"],
    fixReadiness: {
      minimumFixScope: "Design one bounded pricing child slice.",
      suggestedRegressionTest: "Add a focused pricing regression for the selected child slice.",
      whyCurrentTestsMissIt: "The broad concern is not tied to one proof path yet.",
      confidenceDowngradeReasons: []
    },
    supportingQuotes: []
  }],
  rejectedEvidenceIds: [],
  notes: []
}));
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          runId: string;
          synthesis: { candidateCount: number; acceptedCandidateCount?: number; rejectedCandidateCount?: number };
          candidates: Array<{ title: string; readiness?: string; confidence: string; risk: string; confidenceDowngradeReasons?: string[] }>;
        };
        diagnostics: Array<{ code: string }>;
      };
      const candidate = payload.data.candidates.find((item) => item.title === "Repo-wide pricing cleanup needs design");
      expect(payload.data.synthesis.candidateCount).toBe(1);
      expect(payload.data.synthesis.acceptedCandidateCount).toBe(1);
      expect(payload.data.synthesis.rejectedCandidateCount).toBe(0);
      expect(candidate?.readiness).toBe("design-needed");
      expect(candidate?.risk).toBe("design-needed");
      expect(candidate?.confidence).toBe("medium");
      expect(candidate?.confidenceDowngradeReasons?.join(" ")).toContain("too broad");
      expect(payload.diagnostics.some((item) => item.code === "synthesis_broad_candidate_needs_design")).toBe(true);
      expect(payload.diagnostics.some((item) => item.code === "synthesis_split_candidate_without_children")).toBe(true);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { validations: Array<{ status: string; readiness?: string; diagnostics: Array<{ code: string }> }> };
      expect(attempt.validations[0]?.status).toBe("accepted");
      expect(attempt.validations[0]?.readiness).toBe("design-needed");
      expect(attempt.validations[0]?.diagnostics.map((item) => item.code)).toContain("synthesis_split_candidate_without_children");
    });
  });

  test("scan rejects duplicate synthesized candidates and keeps bounded split children", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
const evidenceIds = [...stdin.matchAll(/"id": "(ev-[^"]+)"/g)].map((match) => match[1]);
const outputPath = process.argv[process.argv.indexOf("-o") + 1];
const candidate = {
  title: "Pricing duplication should be split",
  category: "duplication",
  priority: "P2",
  confidence: "medium",
  impact: "feature",
  effort: "medium",
  risk: "moderate",
  readiness: "split-needed",
  files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
  ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
  contextFiles: [{ path: "src/invoice.ts", startLine: 1, endLine: 1 }],
  evidenceIds,
  whyItMatters: "Duplicate pricing logic is safer as bounded child work.",
  likelyRootCause: "Checkout and invoice copied the same calculation.",
  suggestedDirection: "Split the cleanup into one child for checkout and one later child for invoice.",
  expectedBehavior: "Pricing totals stay identical.",
  proofRequired: ["Checkout calculation regression passes."],
  nonGoals: ["Do not edit invoice in the first child."],
  doNotTouch: ["billing API shape"],
  splitChildren: [{
    title: "Extract checkout pricing helper",
    ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    contextFiles: [{ path: "src/invoice.ts", startLine: 1, endLine: 1 }],
    expectedBehavior: "Checkout pricing totals stay identical.",
    proofRequired: ["Checkout regression covers subtotal, discount, tax, and total."],
    verification: ["npm test"],
    nonGoals: ["Do not edit invoice."],
    doNotTouch: ["billing API shape"]
  }],
  confidenceDowngradeReasons: ["Only one child is ready now."],
  verification: ["npm test"],
  fixReadiness: {
    minimumFixScope: "Extract only the checkout pricing helper.",
    suggestedRegressionTest: "Add checkout pricing coverage.",
    whyCurrentTestsMissIt: "Current tests do not pin the copied pricing behavior.",
    confidenceDowngradeReasons: ["Only one child is ready now."]
  },
  supportingQuotes: []
};
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: [candidate, candidate],
  rejectedEvidenceIds: [],
  notes: []
}));
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          runId: string;
          synthesis: { candidateCount: number; rejectedCandidateCount?: number };
          candidates: Array<{ title: string; readiness?: string; splitChildren?: Array<{ title: string }>; confidence: string }>;
        };
        diagnostics: Array<{ code: string }>;
      };
      const candidate = payload.data.candidates.find((item) => item.title === "Pricing duplication should be split");
      expect(payload.data.synthesis.candidateCount).toBe(1);
      expect(payload.data.synthesis.rejectedCandidateCount).toBe(1);
      expect(candidate?.readiness).toBe("split-needed");
      expect(candidate?.splitChildren?.[0]?.title).toBe("Extract checkout pricing helper");
      expect(candidate?.confidence).toBe("low");
      expect(payload.diagnostics.some((item) => item.code === "synthesis_duplicate_candidate")).toBe(true);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { validations: Array<{ status: string; diagnostics: Array<{ code: string }> }> };
      expect(attempt.validations.map((item) => item.status)).toEqual(["accepted", "rejected"]);
      expect(attempt.validations[1]?.diagnostics[0]?.code).toBe("synthesis_duplicate_candidate");
    });
  });

  test("scan reports malformed synthesis output without losing local candidates", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const outputPath = process.argv[process.argv.indexOf("-o") + 1];
fs.writeFileSync(outputPath, "not json");
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { runId: string; candidateCount: number; synthesis: { candidateCount: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.candidateCount).toBeGreaterThan(0);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.diagnostics.some((item) => item.code === "codex_synthesis_error")).toBe(true);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { rawCandidateCount: number; acceptedCandidateCount: number; rejectedCandidateCount: number; diagnostics: Array<{ code: string }> };
      expect(attempt.rawCandidateCount).toBe(0);
      expect(attempt.acceptedCandidateCount).toBe(0);
      expect(attempt.rejectedCandidateCount).toBe(0);
      expect(attempt.diagnostics.some((item) => item.code === "codex_synthesis_error")).toBe(true);
    });
  });

  test("scan recovers from synthesis provider timeouts with local evidence intact", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
setTimeout(() => {}, 2000);
`);

      const result = await runCli(["scan", "--synthesize", "--timeout", "1", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { runId: string; evidenceCount: number; candidateCount: number; synthesis: { candidateCount: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.evidenceCount).toBeGreaterThan(0);
      expect(payload.data.candidateCount).toBeGreaterThan(0);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.diagnostics.some((item) => item.code === "codex_synthesis_timeout")).toBe(true);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { diagnostics: Array<{ code: string }> };
      expect(attempt.diagnostics.some((item) => item.code === "codex_synthesis_timeout")).toBe(true);
    });
  });

  test("scan preserves local evidence when synthesis provider fails", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
process.exit(7);
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { evidenceCount: number; candidateCount: number; synthesis: { candidateCount: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.evidenceCount).toBeGreaterThan(0);
      expect(payload.data.candidateCount).toBeGreaterThan(0);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.diagnostics.some((item) => item.code === "codex_synthesis_failed")).toBe(true);
    });
  });
});

function findingSignatureFixture(): FindingRecord["signature"] {
  return {
    version: "1",
    value: "sig-fixture",
    components: {
      category: "architecture",
      normalizedTitle: "fixture candidate",
      evidenceKinds: ["dependency-hotspot"],
      primaryAnchors: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
      graphNeighborhood: ["src/example.ts->src/other.ts"],
      analyzerRuleIds: ["rule.fixture"],
    },
  };
}

function validateFindingLifecycleRecordSchemas(now: string, signature: FindingRecord["signature"]): void {
  findingRecordSchema.parse({
    schemaVersion,
    recordType: "finding",
    id: "finding-fixture",
    signature,
    identityConfidence: "medium",
    title: "Fixture candidate",
    category: "architecture",
    status: "open",
    lifecycleState: "open",
    priority: "P2",
    confidence: "medium",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    files: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
    evidenceIds: ["ev-test"],
    childFindingIds: [],
    supersedesFindingIds: [],
    observationIds: ["observation-fixture"],
    currentObservationId: "observation-fixture",
    createdAt: now,
    updatedAt: now,
  });

  candidateObservationRecordSchema.parse({
    schemaVersion,
    recordType: "candidate_observation",
    id: "observation-fixture",
    findingId: "finding-fixture",
    candidateId: "candidate-001",
    runId: "run-test",
    signature,
    identityConfidence: "medium",
    baselineStatus: "new",
    evidenceFreshness: "fresh",
    observedAt: now,
  });

  identityMatchRecordSchema.parse({
    schemaVersion,
    recordType: "identity_match",
    id: "identity-fixture",
    runId: "run-test",
    candidateId: "candidate-001",
    signature,
    matchedFindingId: "finding-fixture",
    confidence: "medium",
    reason: "title_and_anchor_overlap",
    unsafeMergeRefused: false,
    possiblePredecessorFindingIds: [],
    createdAt: now,
  });

  lifecycleEventRecordSchema.parse({
    schemaVersion,
    recordType: "lifecycle_event",
    id: "event-fixture",
    targetType: "finding",
    targetId: "finding-fixture",
    findingId: "finding-fixture",
    runId: "run-test",
    kind: "created",
    toState: "open",
    command: "scan",
    createdAt: now,
  });

  revalidationRecordSchema.parse({
    schemaVersion,
    recordType: "revalidation",
    id: "revalidation-fixture",
    targetType: "finding",
    targetId: "finding-fixture",
    runId: "run-test",
    outcome: "unchanged",
    evidenceIds: ["ev-test"],
    previousObservationId: "observation-fixture",
    diagnostics: [],
    createdAt: now,
  });
}

function validateStateManagementRecordSchemas(now: string): void {
  ciRunRecordSchema.parse({
    schemaVersion,
    recordType: "ci_run",
    id: "ci-fixture",
    runId: "run-test",
    baselineRef: "main",
    status: "passed",
    policy: { "max-new-p0": 0 },
    blockingFindingIds: [],
    artifactPaths: { json: ".deepclean/ci/ci-fixture.json" },
    diagnostics: [],
    createdAt: now,
  });

  lockRecordSchema.parse({
    schemaVersion,
    recordType: "lock",
    id: "lock-fixture",
    owner: "deepclean",
    pid: 1,
    command: "scan",
    statePath: ".deepclean",
    createdAt: now,
  });

  retentionManifestRecordSchema.parse({
    schemaVersion,
    recordType: "retention_manifest",
    id: "retention-fixture",
    dryRun: true,
    keepRuns: 5,
    deletePaths: [".deepclean/runs/old.json"],
    retainedPaths: [".deepclean/config.json"],
    blockedPaths: [{ path: ".deepclean/config.json", reason: "config is never pruned" }],
    privacyNotes: ["May contain source paths."],
    createdAt: now,
  });
}

function validatePlanningRecordSchemas(now: string): void {
  fixAttemptRecordSchema.parse({
    schemaVersion,
    recordType: "fix_attempt",
    id: "fix-fixture",
    findingId: "finding-fixture",
    planId: "plan-fixture",
    status: "previewed",
    dryRun: true,
    changedFiles: ["src/example.ts"],
    patchPreviewPath: ".deepclean/fixes/fix-fixture.patch",
    verificationCommands: ["npm test"],
    verificationResults: [{ command: "npm test", passed: true, exitCode: 0 }],
    diagnostics: [],
    createdAt: now,
    updatedAt: now,
  });
}

function validateFeatureAndSynthesisRecordSchemas(now: string): void {
  featureRecordSchema.parse({
    schemaVersion,
    recordType: "feature",
    featureId: "feature-fixture",
    runId: "run-test",
    title: "Checkout calculation module",
    summary: "Checkout behavior owned by src/checkout.ts.",
    kind: "module",
    source: "local-source",
    confidence: "high",
    entrypoints: [{ path: "src/checkout.ts" }],
    ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 20 }],
    contextFiles: [{ path: "src/checkout.test.ts" }],
    testFiles: [{ path: "src/checkout.test.ts" }],
    verification: ["npm test"],
    tags: ["module", "typescript", "area:src"],
    createdAt: now,
    updatedAt: now,
  });

  synthesisAttemptRecordSchema.parse({
    schemaVersion,
    recordType: "synthesis_attempt",
    id: "synthesis-run-test",
    runId: "run-test",
    provider: "codex",
    model: "gpt-test",
    promptVersion: "codex-synthesis-v3-matt-pocock-reviewers",
    promptBytes: 1200,
    runtime: { timeoutMs: 1000 },
    reviewerIds: ["architecture-deepening"],
    evidenceManifest: {
      evidenceCount: 1,
      includedEvidenceIds: ["ev-test"],
      includedFileRefs: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
      omittedEvidenceIds: [],
      includeSource: false,
      tokenBudget: 8000,
      excerptBudget: 0,
    },
    rawCandidateCount: 1,
    acceptedCandidateCount: 1,
    rejectedCandidateCount: 0,
    rejectedEvidenceIds: [],
    notes: [],
    validations: [{
      id: "validation-001",
      status: "accepted",
      draftTitle: "Fixture candidate",
      candidateId: "candidate-001",
      evidenceIds: ["ev-test"],
      fileRefs: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
      diagnostics: [],
      fixReadiness: {
        minimumFixScope: "One bounded module.",
        suggestedRegressionTest: "Add a focused behavior test.",
        whyCurrentTestsMissIt: "Current tests only cover the happy path.",
        confidenceDowngradeReasons: [],
      },
    }],
    diagnostics: [],
    createdAt: now,
  });
}

async function expectStillOpenRevalidation(repo: string): Promise<FindingRecord> {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await writeFile(path.join(repo, "src", "example.ts"), "export const value = 1;\n", "utf8");
  const finding = findingFixture();
  const unchanged = await classifyRevalidation({
    root: repo,
    finding,
    currentCandidates: [candidateFixture({ findingId: finding.id })],
    runId: "run-now",
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  expect(unchanged.outcome).toBe("still-open");
  expect(unchanged.rationale).toContain("rediscovered");
  return finding;
}

async function withTempRepo(fn: (repo: string) => Promise<void>): Promise<void> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "deepclean-test-"));
  try {
    await fn(repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

async function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function writeFixtureSource(repo: string): Promise<void> {
  await mkdir(path.join(repo, "src"), { recursive: true });
  const repeated = [
    "const subtotal = items.reduce((sum, item) => sum + item.price, 0);",
    "const discount = coupon ? subtotal * 0.1 : 0;",
    "const tax = (subtotal - discount) * 0.07;",
    "const total = subtotal - discount + tax;",
    "if (total < 0) throw new Error('invalid total');",
    "return { subtotal, discount, tax, total };",
  ].join("\n");
  const longBody = Array.from({ length: 96 }, (_, index) => `  const value${index} = ${index};`).join("\n");
  await writeFile(path.join(repo, "src", "checkout.ts"), `
export function calculateCheckout(items: Array<{ price: number }>, coupon: boolean) {
${longBody}
${repeated.split("\n").map((line) => `  ${line}`).join("\n")}
}
`, "utf8");
  await writeFile(path.join(repo, "src", "invoice.ts"), `
export function calculateInvoice(items: Array<{ price: number }>, coupon: boolean) {
${repeated.split("\n").map((line) => `  ${line}`).join("\n")}
}
`, "utf8");
}

async function prepareStatusWorkflowState(repo: string): Promise<void> {
  await writeFixtureSource(repo);
  await runCli(["scan", "--evidence-only", "--json"], repo);
  await runCli(["report", "--json"], repo);
  await runCli(["plan", "candidate-001", "--json"], repo);
  await runCli(["handoff", "candidate-001", "--json"], repo);
}

async function writeStaleStatusFixture(repo: string): Promise<void> {
  const latestRun = await latestRunFile(repo);
  const candidatesPath = path.join(repo, ".deepclean", "candidates", latestRun);
  const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as Array<{
    id: string;
    findingId?: string;
    lifecycleState?: string;
    status?: string;
    updatedAt?: string;
  }>;
  const targetIndex = candidates.findIndex((candidate) => candidate.id === "candidate-001");
  const target = candidates[targetIndex];
  expect(target?.findingId).toMatch(/^finding-/);
  expect(candidates.length).toBeGreaterThan(2);
  const revalidatedAt = new Date(Date.now() + 1000).toISOString();
  candidates[targetIndex] = {
    ...target!,
    lifecycleState: "stale",
    status: "stale",
    updatedAt: revalidatedAt,
  };
  candidates[1] = {
    ...candidates[1]!,
    lifecycleState: "resolved",
    status: "fixed",
    updatedAt: revalidatedAt,
  };
  candidates[2] = {
    ...candidates[2]!,
    lifecycleState: "superseded",
    status: "superseded",
    updatedAt: revalidatedAt,
  };
  await writeFile(candidatesPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  await mkdir(path.join(repo, ".deepclean", "revalidations"), { recursive: true });
  await writeFile(path.join(repo, ".deepclean", "revalidations", "revalidation-status-fixture.json"), `${JSON.stringify({
    schemaVersion,
    recordType: "revalidation",
    id: "revalidation-status-fixture",
    targetType: "finding",
    targetId: target?.findingId,
    runId: latestRun.replace(/\.json$/, ""),
    outcome: "stale",
    evidenceIds: [],
    diagnostics: [],
    createdAt: revalidatedAt,
  }, null, 2)}\n`, "utf8");
}

async function installFakeCodex(repo: string, source: string): Promise<void> {
  const fakeCodex = path.join(repo, "fake-codex.js");
  await writeFile(fakeCodex, source, "utf8");
  await chmod(fakeCodex, 0o755);
  await runCli(["init", "--json"], repo);
  const configPath = path.join(repo, ".deepclean", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    reviewSynthesis: { command: string };
  };
  config.reviewSynthesis.command = fakeCodex;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function setupLegacyDisabledAcceptedSynthesis(repo: string): Promise<void> {
  await writeFixtureSource(repo);
  await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
if (
  !stdin.includes("architecture-deepening")
  || !stdin.includes("deep-module-discipline")
  || !stdin.includes("feedback-loop-discipline")
  || !stdin.includes("agent-ready-slices")
  || !stdin.includes("Matt Pocock skills influence")
  || !stdin.includes("Cleanup surfaces:")
  || !stdin.includes("critic-pass")
) {
  console.error("missing reviewer pack or cleanup surfaces");
  process.exit(2);
}
const evidenceIds = [...stdin.matchAll(/"id": "(ev-[^"]+)"/g)].map((match) => match[1]);
if (evidenceIds.length === 0) process.exit(2);
const outputIndex = process.argv.indexOf("-o");
const outputPath = process.argv[outputIndex + 1];
fs.writeFileSync(outputPath, JSON.stringify({
  candidates: [{
    title: "Validation logic is spread across checkout and invoice",
    category: "architecture",
    priority: "P1",
    confidence: "high",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    readiness: "fix-ready",
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }, { path: "src/invoice.ts", startLine: 1, endLine: 1 }],
    ownedFiles: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }, { path: "src/invoice.ts", startLine: 1, endLine: 1 }],
    contextFiles: [],
    evidenceIds,
    whyItMatters: "Spread validation creates drift risk.",
    likelyRootCause: "Fast implementation duplicated the same pricing concept.",
    suggestedDirection: "Create one pricing calculation module and route both callers through it.",
    expectedBehavior: "Checkout and invoice pricing outputs stay unchanged.",
    proofRequired: ["Checkout and invoice regression coverage passes with shared pricing behavior."],
    nonGoals: ["Do not change pricing rules."],
    doNotTouch: ["unrelated checkout UI"],
    splitChildren: [],
    confidenceDowngradeReasons: [],
    verification: ["npm test", "npm run typecheck"],
    fixReadiness: {
      minimumFixScope: "One pricing calculation module plus its callers.",
      suggestedRegressionTest: "Add checkout and invoice regression coverage around pricing calculations.",
      whyCurrentTestsMissIt: "Existing evidence points at structure and duplication, not behavior-level coverage.",
      confidenceDowngradeReasons: []
    },
    supportingQuotes: []
  }],
  rejectedEvidenceIds: [],
  notes: ["fake synthesis complete"]
}));
`);
  const configPath = path.join(repo, ".deepclean", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    reviewSynthesis: { enabled: boolean };
  };
  config.reviewSynthesis.enabled = false;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

type AcceptedSynthesisScanPayload = {
  data: {
    runId: string;
    synthesis: {
      requested: boolean;
      candidateCount: number;
      acceptedCandidateCount?: number;
      rejectedCandidateCount?: number;
      attemptId?: string;
      runtime: Record<string, unknown>;
    };
    candidates: Array<{
      id: string;
      provenance: {
        source: string;
        model?: string;
        runtime?: Record<string, unknown>;
        synthesisAttemptId?: string;
        validationId?: string;
        reviewerRubricVersions?: Record<string, string>;
      };
      readiness?: string;
      ownedFiles?: Array<{ path: string }>;
      proofRequired?: string[];
      nonGoals?: string[];
      doNotTouch?: string[];
      fixReadiness?: { minimumFixScope: string };
    }>;
  };
};

function expectAcceptedSynthesisScanPayload(payload: AcceptedSynthesisScanPayload): string {
  const candidate = payload.data.candidates[0];
  expect(payload.data.synthesis.requested).toBe(true);
  expect(payload.data.synthesis.candidateCount).toBe(1);
  expect(payload.data.synthesis.acceptedCandidateCount).toBe(1);
  expect(payload.data.synthesis.rejectedCandidateCount).toBe(0);
  expect(payload.data.synthesis.attemptId).toMatch(/^synthesis-/);
  expect(candidate?.provenance.source).toBe("model-synthesis");
  expect(candidate?.provenance.model).toBe("gpt-test");
  expect(candidate?.provenance.synthesisAttemptId).toBe(payload.data.synthesis.attemptId);
  expect(candidate?.provenance.validationId).toBe("validation-001");
  expect(candidate?.provenance.reviewerRubricVersions?.["architecture-deepening"]).toContain("beta-synthesis-quality");
  expect(candidate?.readiness).toBe("fix-ready");
  expect(candidate?.ownedFiles?.map((file) => file.path)).toEqual(["src/checkout.ts", "src/invoice.ts"]);
  expect(candidate?.proofRequired?.[0]).toContain("regression coverage");
  expect(candidate?.nonGoals).toContain("Do not change pricing rules.");
  expect(candidate?.doNotTouch).toContain("unrelated checkout UI");
  expect(candidate?.fixReadiness?.minimumFixScope).toContain("pricing");
  expect(payload.data.synthesis.runtime["timeoutMs"]).toBe(5000);
  expect(payload.data.synthesis.runtime["retries"]).toBe(1);
  expect(payload.data.synthesis.runtime["rpm"]).toBe(7);
  expect(payload.data.synthesis.runtime["concurrency"]).toBe(2);
  expect(payload.data.synthesis.runtime["tokenBudget"]).toBe(1000);
  expect(payload.data.synthesis.runtime["excerptBudget"]).toBe(0);
  expect(payload.data.synthesis.runtime["privacyMode"]).toBe("metadata");
  expect(candidate?.provenance.runtime?.["timeoutMs"]).toBe(5000);
  return candidate?.id ?? "";
}

async function writeLockFixture(repo: string, overrides: Partial<LockRecord> = {}): Promise<void> {
  const lock: LockRecord = {
    schemaVersion,
    recordType: "lock",
    id: "state-writer",
    owner: "test@localhost",
    pid: process.pid,
    command: "scan",
    statePath: path.join(repo, ".deepclean"),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  await mkdir(path.join(repo, ".deepclean", "locks"), { recursive: true });
  await writeFile(path.join(repo, ".deepclean", "locks", "state-writer.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

async function writeOldRunArtifacts(repo: string): Promise<void> {
  const state = path.join(repo, ".deepclean");
  const oldRunId = "run-20000101000000-old";
  await mkdir(path.join(state, "runs"), { recursive: true });
  await mkdir(path.join(state, "evidence"), { recursive: true });
  await mkdir(path.join(state, "features"), { recursive: true });
  await mkdir(path.join(state, "candidates"), { recursive: true });
  await mkdir(path.join(state, "clusters"), { recursive: true });
  await mkdir(path.join(state, "observations"), { recursive: true });
  await mkdir(path.join(state, "synthesis"), { recursive: true });
  await mkdir(path.join(state, "opportunities"), { recursive: true });
  await mkdir(path.join(state, "reports"), { recursive: true });
  await mkdir(path.join(state, "plans"), { recursive: true });
  await mkdir(path.join(state, "handoffs"), { recursive: true });
  await writeFile(path.join(state, "runs", `${oldRunId}.json`), `${JSON.stringify({
    schemaVersion,
    recordType: "run",
    id: oldRunId,
    command: "scan",
    root: repo,
    startedAt: "2000-01-01T00:00:00.000Z",
    completedAt: "2000-01-01T00:00:00.000Z",
    evidenceCount: 0,
    candidateCount: 0,
    clusterCount: 0,
    synthesis: { requested: false, candidateCount: 0 },
    diagnostics: [],
  }, null, 2)}\n`, "utf8");
  for (const dir of ["evidence", "features", "candidates", "clusters", "observations"]) {
    await writeFile(path.join(state, dir, `${oldRunId}.json`), "[]\n", "utf8");
  }
  await writeFile(path.join(state, "opportunities", `${oldRunId}.json`), "[]\n", "utf8");
  await writeFile(path.join(state, "synthesis", `${oldRunId}.json`), `${JSON.stringify({
    schemaVersion,
    recordType: "synthesis_attempt",
    id: "synthesis-20000101000000-old",
    runId: oldRunId,
    provider: "codex",
    promptVersion: "codex-synthesis-v3-matt-pocock-reviewers",
    promptBytes: 100,
    runtime: { timeoutMs: 1000 },
    reviewerIds: [],
    evidenceManifest: {
      evidenceCount: 0,
      includedEvidenceIds: [],
      includedFileRefs: [],
      omittedEvidenceIds: [],
      includeSource: false,
      tokenBudget: 8000,
      excerptBudget: 0,
    },
    rawCandidateCount: 0,
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    rejectedEvidenceIds: [],
    notes: [],
    validations: [],
    diagnostics: [],
    createdAt: "2000-01-01T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(state, "reports", "report-old.json"), `${JSON.stringify({
    schemaVersion,
    recordType: "report",
    id: "report-old",
    runId: oldRunId,
    createdAt: "2000-01-01T00:00:00.000Z",
    candidateIds: [],
    summary: { open: 0, total: 0, byPriority: {} },
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(state, "reports", "report-old.md"), "# Old report\n", "utf8");
  await writeFile(path.join(state, "plans", "plan-old.json"), `${JSON.stringify({
    schemaVersion,
    recordType: "plan",
    id: "plan-old",
    runId: oldRunId,
    targetType: "candidate",
    targetId: "candidate-old",
    title: "Old plan",
    summary: "Old plan",
    steps: [],
    constraints: [],
    verification: [],
    createdAt: "2000-01-01T00:00:00.000Z",
    content: "Old plan",
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(state, "handoffs", "handoff-old.json"), `${JSON.stringify({
    schemaVersion,
    recordType: "handoff",
    id: "handoff-old",
    candidateId: "candidate-old",
    format: "codex",
    createdAt: "2000-01-01T00:00:00.000Z",
    content: "Old handoff",
  }, null, 2)}\n`, "utf8");
}

async function prepareFixableRepo(repo: string): Promise<{ candidateId: string; findingId: string; patchPath: string }> {
  await writeFixtureSource(repo);
  await execFileAsync("git", ["init"], { cwd: repo });
  await execFileAsync("git", ["config", "user.email", "deepclean@example.com"], { cwd: repo });
  await execFileAsync("git", ["config", "user.name", "Deepclean Test"], { cwd: repo });
  await execFileAsync("git", ["add", "."], { cwd: repo });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo });
  const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
  const scanPayload = JSON.parse(scan.stdout) as {
    data: { candidates: Array<{ id: string; findingId?: string; confidence: string; risk: string }> };
  };
  const candidate = scanPayload.data.candidates.find((item) => item.findingId && item.confidence !== "low" && item.risk !== "design-needed");
  if (!candidate?.findingId) {
    throw new Error("No fixable candidate in fixture");
  }
  await runCli(["plan", candidate.id, "--json"], repo);
  await runCli(["revalidate", candidate.findingId, "--json"], repo);
  const invoicePath = path.join(repo, "src", "invoice.ts");
  const original = await readFile(invoicePath, "utf8");
  await writeFile(invoicePath, original.replace("export function", "// deepclean fix applied\nexport function"), "utf8");
  const diff = await execFileAsync("git", ["diff", "--", "src/invoice.ts"], { cwd: repo });
  await writeFile(invoicePath, original, "utf8");
  const patchPath = path.join(repo, "fix.patch");
  await writeFile(patchPath, diff.stdout, "utf8");
  return { candidateId: candidate.id, findingId: candidate.findingId, patchPath };
}

async function writeFixOpportunity(
  repo: string,
  candidateId: string,
  classification: "safe-narrow-pr" | "tests-first",
): Promise<string> {
  const runFile = await latestRunFile(repo);
  const runId = runFile.replace(/\.json$/, "");
  const opportunityId = `opportunity-${classification}`;
  await mkdir(path.join(repo, ".deepclean", "opportunities"), { recursive: true });
  await writeFile(path.join(repo, ".deepclean", "opportunities", runFile), `${JSON.stringify([{
    schemaVersion,
    recordType: "pr_opportunity",
    id: opportunityId,
    runId,
    targetCandidateIds: [candidateId],
    targetFindingIds: [],
    targetClusterIds: [],
    classification,
    status: classification === "safe-narrow-pr" ? "recommended" : "blocked",
    title: "Fix invoice calculation boundary",
    oneSentenceChange: "Apply the existing focused invoice patch.",
    rationale: "The opportunity is a test fixture for guarded fix target resolution.",
    score: 90,
    confidence: "high",
    risk: "safe",
    ownedFiles: [{ path: "src/invoice.ts" }],
    contextFiles: [],
    doNotTouch: ["src/checkout.ts"],
    behaviorInvariants: ["Invoice output stays equivalent."],
    validationPlan: ["test -f src/invoice.ts"],
    testsRequiredFirst: classification === "tests-first",
    expectedReviewerConcern: "Keep the patch scoped to the invoice fixture.",
    stopLine: "Stop after the invoice patch previews cleanly.",
    expectedPayoff: "Proves opportunity IDs can drive guarded fix safely.",
    refusalReason: classification === "tests-first" ? "Add tests before mutating source." : undefined,
    sourceSignals: [],
    diagnostics: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  }], null, 2)}\n`, "utf8");
  return opportunityId;
}

async function prepareSplittableCandidate(repo: string): Promise<{ id: string }> {
  await writeFixtureSource(repo);
  const scan = await runCli(["scan", "--evidence-only", "--json"], repo);
  expect(scan.code).toBe(0);
  const scanPayload = JSON.parse(scan.stdout) as {
    data: { candidates: Array<{ id: string; title: string; effort: string }> };
  };
  const candidate = scanPayload.data.candidates.find((item) => item.title.startsWith("Large function:") || item.effort === "large");
  if (!candidate) {
    throw new Error("No splittable candidate in fixture");
  }
  return { id: candidate.id };
}

async function enableFixExecution(repo: string): Promise<void> {
  const configPath = path.join(repo, ".deepclean", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    fixExecution?: { enabled?: boolean; verificationCommands?: string[]; maxAttempts?: number; workerIdleTimeoutMs?: number; workerHardTimeoutMs?: number };
  };
  config.fixExecution = {
    ...config.fixExecution,
    enabled: true,
    verificationCommands: config.fixExecution?.verificationCommands ?? [],
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function configureFixWorkerTimeouts(
  repo: string,
  options: { idleTimeoutMs: number; hardTimeoutMs: number },
): Promise<void> {
  const configPath = path.join(repo, ".deepclean", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    fixExecution?: { workerIdleTimeoutMs?: number; workerHardTimeoutMs?: number };
  };
  config.fixExecution = {
    ...config.fixExecution,
    workerIdleTimeoutMs: options.idleTimeoutMs,
    workerHardTimeoutMs: options.hardTimeoutMs,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function latestRunFile(repo: string): Promise<string> {
  const runs = (await readdir(path.join(repo, ".deepclean", "runs")))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const run = runs.at(-1);
  if (!run) {
    throw new Error("No run file found");
  }
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findingFixture(overrides: Partial<FindingRecord> = {}): FindingRecord {
  const now = "2026-05-24T00:00:00.000Z";
  const signature = {
    version: "1" as const,
    value: "sig-fixture",
    components: {
      category: "architecture",
      normalizedTitle: "fixture candidate",
      evidenceKinds: ["dependency-hotspot"],
      primaryAnchors: [{ path: "src/example.ts" }],
    },
  };
  const base: FindingRecord = {
    schemaVersion,
    recordType: "finding",
    id: "finding-fixture",
    signature,
    identityConfidence: "high",
    title: "Fixture candidate",
    category: "architecture",
    status: "open",
    lifecycleState: "open",
    priority: "P2",
    confidence: "medium",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    files: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
    evidenceIds: ["ev-test"],
    childFindingIds: [],
    supersedesFindingIds: [],
    observationIds: ["observation-fixture"],
    currentObservationId: "observation-fixture",
    createdAt: now,
    updatedAt: now,
  };
  const merged: FindingRecord = { ...base, ...overrides };
  return {
    ...merged,
    childFindingIds: merged.childFindingIds ?? [],
    supersedesFindingIds: merged.supersedesFindingIds ?? [],
  };
}

function candidateFixture(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  const now = "2026-05-24T00:00:00.000Z";
  return {
    schemaVersion,
    recordType: "candidate",
    id: "candidate-001",
    runId: "run-test",
    title: "Fixture candidate",
    category: "architecture",
    status: "open",
    priority: "P2",
    confidence: "medium",
    impact: "feature",
    effort: "medium",
    risk: "moderate",
    files: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
    evidenceIds: ["ev-test"],
    affectedFeatureIds: [],
    featureScope: "unmapped",
    whyItMatters: "Fixture why.",
    likelyRootCause: "Fixture cause.",
    suggestedDirection: "Fixture direction.",
    verification: ["npm test"],
    provenance: { source: "local-evidence" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function evidenceFixture(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  const now = "2026-05-24T00:00:00.000Z";
  return {
    schemaVersion,
    recordType: "evidence",
    id: "ev-test",
    runId: "run-test",
    adapter: "test",
    kind: "large-function",
    title: "Fixture evidence",
    summary: "Fixture evidence summary.",
    files: [{ path: "src/example.ts", startLine: 1, endLine: 20 }],
    affectedFeatureIds: [],
    fileRoles: [],
    data: {},
    confidence: "medium",
    createdAt: now,
    ...overrides,
  };
}

function sourceFile(filePath: string, text: string): SourceFile {
  return {
    path: filePath,
    absolutePath: filePath,
    extension: path.extname(filePath),
    text,
    lines: text.split(/\r?\n/),
  };
}

function featureFixture(overrides: Partial<FeatureRecord> = {}): FeatureRecord {
  const now = "2026-05-24T00:00:00.000Z";
  return {
    schemaVersion,
    recordType: "feature",
    featureId: "feature-fixture",
    runId: "run-test",
    title: "Fixture feature",
    summary: "Fixture feature summary.",
    kind: "module",
    source: "src/example.ts",
    mapSource: "heuristic",
    mapperVersion: "local-v1",
    confidence: "medium",
    entrypoints: [{ path: "src/example.ts" }],
    ownedFiles: [{ path: "src/example.ts" }],
    contextFiles: [],
    testFiles: [],
    fileRoles: [{ path: "src/example.ts", role: "owned" }],
    reasons: ["fixture"],
    verification: ["npm test"],
    tags: ["source"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function runCli(argv: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => stdout.push(args.join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.join(" "));
  try {
    const code = await main(argv, cwd);
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function runJsonCli<T = unknown>(argv: string[], cwd: string): Promise<T> {
  const result = await runCli(argv, cwd);
  expect(result.code).toBe(0);
  return JSON.parse(result.stdout) as T;
}

type StatusWorkflowPayload = {
  data: {
    latestRun: { id: string; path: string };
    latestReport: { id: string; jsonPath: string; markdownPath: string };
    queue: { stale: number; blocked: number; active: number; fixed: number; byLifecycleState: Record<string, number> };
    activeItems: Array<{ id: string; status: string; lifecycleState?: string }>;
    blockedItems: Array<{ id: string; reason: string }>;
    staleArtifacts: Array<{ type: string; targetId?: string; reason: string; recommendation: string }>;
    latestArtifacts: {
      latestReport?: { id: string };
      latestPlan?: { id: string };
      latestHandoff?: { id: string };
      latestRevalidation?: { id: string };
    };
    recentProgress: Array<{ type: string; kind: string; id: string }>;
    nextAction: { command: string; reason: string };
    pendingRevalidation: number;
  };
  diagnostics: Array<{ code: string }>;
};

function expectStatusWorkflowPayload(result: Awaited<ReturnType<typeof runCli>>): void {
  expect(result.code).toBe(0);
  const payload = JSON.parse(result.stdout) as StatusWorkflowPayload;
  expect(payload.data.latestRun.id).toMatch(/^run-/);
  expect(payload.data.latestRun.path).toContain(".deepclean/runs/");
  expect(payload.data.latestReport.jsonPath).toContain(".deepclean/reports/");
  expect(payload.data.latestReport.markdownPath).toContain(".deepclean/reports/");
  expect(payload.data.queue.stale).toBeGreaterThanOrEqual(1);
  expect(payload.data.queue.blocked).toBeGreaterThanOrEqual(1);
  expect(payload.data.queue.fixed).toBeGreaterThanOrEqual(1);
  expect(payload.data.queue.byLifecycleState["stale"]).toBeGreaterThanOrEqual(1);
  expect(payload.data.queue.byLifecycleState["resolved"]).toBeGreaterThanOrEqual(1);
  expect(payload.data.queue.byLifecycleState["superseded"]).toBeGreaterThanOrEqual(1);
  expect(payload.data.activeItems.some((item) => (
    item.status === "fixed"
    || item.status === "superseded"
    || item.lifecycleState === "stale"
    || item.lifecycleState === "resolved"
  ))).toBe(false);
  expect(payload.data.pendingRevalidation).toBeGreaterThanOrEqual(1);
  expect(payload.data.blockedItems.some((item) => (
    item.id === "candidate-001"
    && item.reason.includes("revalidation")
  ))).toBe(true);
  expect(payload.data.staleArtifacts.some((artifact) => (
    artifact.type === "plan"
    && artifact.targetId === "candidate-001"
    && artifact.recommendation.includes("deepclean plan")
  ))).toBe(true);
  expect(payload.data.staleArtifacts.some((artifact) => (
    artifact.type === "handoff"
    && artifact.targetId === "candidate-001"
    && artifact.reason.includes("not ready")
  ))).toBe(true);
  expect(payload.data.latestArtifacts.latestReport?.id).toMatch(/^report-/);
  expect(payload.data.latestArtifacts.latestPlan?.id).toMatch(/^plan-/);
  expect(payload.data.latestArtifacts.latestHandoff?.id).toMatch(/^handoff-/);
  expect(payload.data.latestArtifacts.latestRevalidation?.id).toBe("revalidation-status-fixture");
  expect(payload.data.recentProgress.some((event) => event.type === "report")).toBe(true);
  expect(payload.data.recentProgress.some((event) => event.type === "plan")).toBe(true);
  expect(payload.data.recentProgress.some((event) => event.type === "handoff")).toBe(true);
  expect(payload.data.recentProgress.some((event) => event.kind === "revalidation:stale")).toBe(true);
  expect(payload.data.nextAction.command).toBe("deepclean revalidate all");
  expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "stale_state")).toBe(true);
}

function expectDoctorPackageUpdate(
  result: Awaited<ReturnType<typeof runCli>>,
  expected: {
    checked: boolean;
    stale: boolean;
    diagnosticCode: string;
    error?: string;
    skippedReason?: string;
  },
): void {
  expect(result.code).toBe(0);
  const payload = JSON.parse(result.stdout) as {
    data: { packageUpdate: { checked: boolean; error?: string; skippedReason?: string; stale: boolean } };
    diagnostics: Array<{ code: string }>;
  };
  expect(payload.data.packageUpdate.checked).toBe(expected.checked);
  expect(payload.data.packageUpdate.stale).toBe(expected.stale);
  if (expected.error !== undefined) {
    expect(payload.data.packageUpdate.error).toBe(expected.error);
  }
  if (expected.skippedReason !== undefined) {
    expect(payload.data.packageUpdate.skippedReason).toBe(expected.skippedReason);
  }
  expect(payload.diagnostics.some((diagnostic) => diagnostic.code === expected.diagnosticCode)).toBe(true);
}

async function expectDeepcleanStateDirectories(repo: string): Promise<void> {
  const dirs = [
    "findings",
    "observations",
    "lifecycle",
    "identity-matches",
    "revalidations",
    "ci",
    "opportunities",
    "campaigns",
    path.join("quality", "profiles"),
    path.join("quality", "results"),
    path.join("quality", "setup"),
    "locks",
    "retention",
    "fixes",
    "features",
    "synthesis",
  ];
  for (const dir of dirs) {
    expect((await stat(path.join(repo, ".deepclean", dir))).isDirectory()).toBe(true);
  }
}
