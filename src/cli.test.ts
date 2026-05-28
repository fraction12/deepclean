import { chmod, mkdtemp, readFile, readdir, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { main } from "./cli.js";
import { readLockStatuses, withStateWriteLock } from "./locks.js";
import { buildCandidatePlan } from "./plans.js";
import { buildReportRecord } from "./reporting.js";
import { classifyRevalidation } from "./revalidation.js";
import { resolveStatePaths } from "./state.js";
import {
  candidateObservationRecordSchema,
  candidateRecordSchema,
  ciRunRecordSchema,
  featureRecordSchema,
  findingRecordSchema,
  fixAttemptRecordSchema,
  lifecycleEventRecordSchema,
  lockRecordSchema,
  retentionManifestRecordSchema,
  revalidationRecordSchema,
  schemaVersion,
  synthesisAttemptRecordSchema,
  type CandidateRecord,
  type FeatureRecord,
  type FindingRecord,
  type LockRecord,
} from "./types.js";

const execFileAsync = promisify(execFile);

describe("deepclean cli", () => {
  test("initializes state and emits JSON", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["init", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as { ok: boolean; data: { stateDir: string } };
      expect(payload.ok).toBe(true);
      expect(payload.data.stateDir.endsWith(".deepclean")).toBe(true);
    });
  });

  test("initializes operating-loop state directories", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["init", "--json"], repo);
      expect(result.code).toBe(0);
      const dirs = [
        "findings",
        "observations",
        "lifecycle",
        "revalidations",
        "ci",
        "locks",
        "retention",
        "fixes",
        "features",
        "synthesis",
      ];
      for (const dir of dirs) {
        expect((await stat(path.join(repo, ".deepclean", dir))).isDirectory()).toBe(true);
      }
    });
  });

  test("supports global flags before the command", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["--root", repo, "init", "--json"], "/");
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as { ok: boolean; data: { root: string } };
      expect(payload.ok).toBe(true);
      expect(payload.data.root).toBe(repo);
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

  test("doctor reports an uninitialized clean directory without mutating state", async () => {
    await withTempRepo(async (repo) => {
      const result = await runCli(["doctor", "--json"], repo);
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
      const result = await runCli(["doctor", "--json"], repo);
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
    const signature = {
      version: "1" as const,
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

      const doctor = await runCli(["doctor", "--stale-lock-ms", "1", "--json"], repo);
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
      expect(payload.data.sourceFileCount).toBe(8);
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
      const nextPayload = JSON.parse(next.stdout) as { data: { candidate: { id: string } | null } };
      expect(nextPayload.data.candidate?.id).toMatch(/^candidate-/);

      const id = nextPayload.data.candidate?.id;
      expect(id).toBeTruthy();
      const show = await runCli(["show", id ?? "", "--json"], repo);
      const showPayload = JSON.parse(show.stdout) as {
        data: { candidate: { id: string }; evidence: unknown[]; features: unknown[] };
      };
      expect(showPayload.data.candidate.id).toBe(id);
      expect(showPayload.data.evidence.length).toBeGreaterThan(0);
      expect(showPayload.data.features.length).toBeGreaterThan(0);
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
      expect(payload.data.revalidations[0]?.outcome).toBe("unchanged");

      const history = await runCli(["history", target ?? "", "--json"], repo);
      const historyPayload = JSON.parse(history.stdout) as {
        data: { events: Array<{ kind: string; data?: { outcome?: string } }> };
      };
      expect(historyPayload.data.events.some((event) => (
        event.kind === "revalidated"
        && event.data?.outcome === "unchanged"
      ))).toBe(true);
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
        data: { ciRun: { status: string }; result: { blockingFindingIds: string[] } };
      };
      expect(passPayload.data.ciRun.status).toBe("passed");
      expect(passPayload.data.result.blockingFindingIds).toEqual([]);

      const fail = await runCli([
        "ci",
        "--evidence-only",
        "--json",
        "--max-new-p2",
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
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    evidenceIds,
    whyItMatters: "The cleanup should be prioritized from evidence.",
    likelyRootCause: "The same responsibility is spread across files.",
    suggestedDirection: "Create one focused module for the shared behavior.",
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
      expect(unchanged.outcome).toBe("unchanged");

      const changed = await classifyRevalidation({
        root: repo,
        finding,
        currentCandidates: [candidateFixture({ findingId: "finding-other", category: finding.category })],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(changed.outcome).toBe("changed");

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

      const stale = await classifyRevalidation({
        root: repo,
        finding,
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(stale.outcome).toBe("stale");

      const fixed = await classifyRevalidation({
        root: repo,
        finding: { ...finding, files: [{ path: "src/missing.ts" }] },
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(fixed.outcome).toBe("fixed");

      const inconclusive = await classifyRevalidation({
        root: repo,
        finding: undefined,
        currentCandidates: [],
        runId: "run-now",
        createdAt: "2026-05-24T00:00:00.000Z",
      });
      expect(inconclusive.outcome).toBe("inconclusive");
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
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }, { path: "src/invoice.ts", startLine: 1, endLine: 1 }],
    evidenceIds,
    whyItMatters: "Spread validation creates drift risk.",
    likelyRootCause: "Fast implementation duplicated the same pricing concept.",
    suggestedDirection: "Create one pricing calculation module and route both callers through it.",
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
      const payload = JSON.parse(result.stdout) as {
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
            };
            fixReadiness?: { minimumFixScope: string };
          }>;
        };
      };
      expect(payload.data.synthesis.requested).toBe(true);
      expect(payload.data.synthesis.candidateCount).toBe(1);
      expect(payload.data.synthesis.acceptedCandidateCount).toBe(1);
      expect(payload.data.synthesis.rejectedCandidateCount).toBe(0);
      expect(payload.data.synthesis.attemptId).toMatch(/^synthesis-/);
      expect(payload.data.candidates[0]?.provenance.source).toBe("model-synthesis");
      expect(payload.data.candidates[0]?.provenance.model).toBe("gpt-test");
      expect(payload.data.candidates[0]?.provenance.synthesisAttemptId).toBe(payload.data.synthesis.attemptId);
      expect(payload.data.candidates[0]?.provenance.validationId).toBe("validation-001");
      expect(payload.data.candidates[0]?.fixReadiness?.minimumFixScope).toContain("pricing");
      expect(payload.data.synthesis.runtime["timeoutMs"]).toBe(5000);
      expect(payload.data.synthesis.runtime["retries"]).toBe(1);
      expect(payload.data.synthesis.runtime["rpm"]).toBe(7);
      expect(payload.data.synthesis.runtime["concurrency"]).toBe(2);
      expect(payload.data.synthesis.runtime["tokenBudget"]).toBe(1000);
      expect(payload.data.synthesis.runtime["excerptBudget"]).toBe(0);
      expect(payload.data.synthesis.runtime["privacyMode"]).toBe("metadata");
      expect(payload.data.candidates[0]?.provenance.runtime?.["timeoutMs"]).toBe(5000);
      const attempt = JSON.parse(
        await readFile(path.join(repo, ".deepclean", "synthesis", `${payload.data.runId}.json`), "utf8"),
      ) as { rawCandidateCount: number; acceptedCandidateCount: number; validations: Array<{ status: string; candidateId?: string }> };
      expect(attempt.rawCandidateCount).toBe(1);
      expect(attempt.acceptedCandidateCount).toBe(1);
      expect(attempt.validations[0]?.status).toBe("accepted");
      expect(attempt.validations[0]?.candidateId).toBe(payload.data.candidates[0]?.id);

      const explain = await runCli(["explain", payload.data.candidates[0]?.id ?? "", "--json"], repo);
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
      const result = await runCli(["fix", prepared.candidateId, "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
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

  test("fix refuses when fix execution is disabled in config", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      const result = await runCli(["fix", prepared.candidateId, "--patch", prepared.patchPath, "--dry-run", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { error: { code: string; message: string } };
      expect(payload.error.code).toBe("fix_execution_disabled");
      expect(payload.error.message).toContain("fixExecution.enabled");
    });
  });

  test("fix applies a local patch and captures verification results without external side effects", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "fix",
        prepared.candidateId,
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
          attempt: { status: string; dryRun: boolean; verificationResults: Array<{ passed: boolean; outputPath?: string }> };
          externalSideEffects: unknown[];
        };
      };
      expect(payload.data.attempt.status).toBe("passed");
      expect(payload.data.attempt.dryRun).toBe(false);
      expect(payload.data.attempt.verificationResults[0]?.passed).toBe(true);
      expect(payload.data.externalSideEffects).toEqual([]);
      expect(await readFile(path.join(repo, "src", "invoice.ts"), "utf8")).toContain("deepclean fix applied");
      await expect(stat(payload.data.attempt.verificationResults[0]?.outputPath ?? "")).resolves.toBeTruthy();
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

  test("fix can invoke a bounded local Codex patch worker without an explicit patch file", async () => {
    await withTempRepo(async (repo) => {
      const prepared = await prepareFixableRepo(repo);
      await rm(prepared.patchPath, { force: true });
      await enableFixExecution(repo);
      await installFakeCodex(repo, `#!/usr/bin/env node
const fs = require("node:fs");
fs.readFileSync(0, "utf8");
const target = "src/invoice.ts";
const source = fs.readFileSync(target, "utf8");
fs.writeFileSync(target, source.replace("export function", "// worker fix applied\\nexport function"));
`);
      const result = await runCli([
        "fix",
        prepared.candidateId,
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

  test("work refuses broad parent candidates before branch creation", async () => {
    await withTempRepo(async (repo) => {
      const parent = await prepareSplittableCandidate(repo);
      await enableFixExecution(repo);
      const result = await runCli([
        "work",
        parent.id,
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
      expect(payload.data.revalidation?.outcome).toBe("stale");
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
      expect(payload.data.revalidation?.outcome).toBe("stale");
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
    files: [{ path: "src/checkout.ts", startLine: 1, endLine: 1 }],
    evidenceIds: ["ev-not-present"],
    whyItMatters: "This should not persist.",
    likelyRootCause: "Unsupported evidence.",
    suggestedDirection: "Reject it.",
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

async function withTempRepo(fn: (repo: string) => Promise<void>): Promise<void> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "deepclean-test-"));
  try {
    await fn(repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
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
  return {
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
    observationIds: ["observation-fixture"],
    currentObservationId: "observation-fixture",
    createdAt: now,
    updatedAt: now,
    ...overrides,
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
