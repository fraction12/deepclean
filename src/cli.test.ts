import { chmod, mkdtemp, readFile, readdir, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { main } from "./cli.js";
import { buildCandidatePlan } from "./plans.js";
import { buildReportRecord } from "./reporting.js";
import { classifyRevalidation } from "./revalidation.js";
import {
  candidateObservationRecordSchema,
  candidateRecordSchema,
  ciRunRecordSchema,
  findingRecordSchema,
  fixAttemptRecordSchema,
  lifecycleEventRecordSchema,
  lockRecordSchema,
  retentionManifestRecordSchema,
  revalidationRecordSchema,
  schemaVersion,
  type CandidateRecord,
  type FindingRecord,
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
      await runCli(["scan", "--json"], repo);
      await writeFile(path.join(repo, "dirty.ts"), "export const dirty = true;\n", "utf8");
      const result = await runCli(["status", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          initialized: boolean;
          latestRunId?: string;
          git: { available: boolean; dirty: boolean };
          queue: { open: number; total: number; evidence: number; themes: number };
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
      expect(payload.data.artifacts["runs"]).toBeGreaterThan(0);
      expect(payload.data.artifacts["candidates"]).toBeGreaterThan(0);
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
  });

  test("scans source files and produces agent-readable candidates", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const scan = await runCli(["scan", "--json"], repo);
      expect(scan.code).toBe(0);
      const scanPayload = JSON.parse(scan.stdout) as {
        ok: boolean;
        data: { evidenceCount: number; candidateCount: number; candidates: Array<{ id: string }> };
      };
      expect(scanPayload.ok).toBe(true);
      expect(scanPayload.data.evidenceCount).toBeGreaterThan(0);
      expect(scanPayload.data.candidateCount).toBeGreaterThan(0);
      expect(scanPayload.data.candidates[0]?.id).toMatch(/^candidate-/);

      const next = await runCli(["next", "--json"], repo);
      const nextPayload = JSON.parse(next.stdout) as { data: { candidate: { id: string } | null } };
      expect(nextPayload.data.candidate?.id).toMatch(/^candidate-/);

      const id = nextPayload.data.candidate?.id;
      expect(id).toBeTruthy();
      const show = await runCli(["show", id ?? "", "--json"], repo);
      const showPayload = JSON.parse(show.stdout) as { data: { candidate: { id: string }; evidence: unknown[] } };
      expect(showPayload.data.candidate.id).toBe(id);
      expect(showPayload.data.evidence.length).toBeGreaterThan(0);
    });
  });

  test("links repeated scans to stable findings and lifecycle history", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const first = await runCli(["scan", "--json"], repo);
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

      const second = await runCli(["scan", "--json"], repo);
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
      await runCli(["scan", "--json"], repo);
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

      const result = await runCli(["scan", "--since", "HEAD~1", "--include-dirty", "--json"], repo);
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
      const pass = await runCli(["ci", "--json", "--max-new-p0", "0"], repo);
      expect(pass.code).toBe(0);
      const passPayload = JSON.parse(pass.stdout) as {
        data: { ciRun: { status: string }; result: { blockingFindingIds: string[] } };
      };
      expect(passPayload.data.ciRun.status).toBe("passed");
      expect(passPayload.data.result.blockingFindingIds).toEqual([]);

      const fail = await runCli([
        "ci",
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

  test("ci mode fails fast when synthesis is required but not requested", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      const result = await runCli(["ci", "--require-synthesis", "--json"], repo);
      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("ci_synthesis_required");
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
      await runCli(["scan", "--json"], repo);
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
      await runCli(["scan", "--json"], repo);
      const result = await runCli(["handoff", "candidate-001", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { handoff: { content: string }; path: string };
      };
      expect(payload.data.handoff.content).toContain("TASK:");
      const saved = await readFile(payload.data.path, "utf8");
      expect(saved).toContain("candidateId");
    });
  });

  test("clusters related candidates and writes a cluster artifact", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--json"], repo);
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
      await runCli(["scan", "--json"], repo);
      await runCli(["cluster", "--json"], repo);
      const result = await runCli(["plan", "theme-001", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { plan: { targetType: string; content: string; steps: unknown[] }; path: string };
      };
      expect(payload.data.plan.targetType).toBe("cluster");
      expect(payload.data.plan.steps.length).toBeGreaterThan(1);
      expect(payload.data.plan.content).toContain("TASK:");
      const saved = await readFile(payload.data.path, "utf8");
      expect(saved).toContain("constraints");
    });
  });

  test("report includes start-here recommendations for agents", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--json"], repo);
      const result = await runCli(["report", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: {
          report: {
            recommendations?: {
              startHere?: { id: string; type: string };
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
      expect(payload.data.report.recommendations?.suggestedPlanTargets.length).toBeGreaterThan(0);
      expect(payload.data.reportPath).toBe(payload.data.paths.markdownPath);
      expect(payload.data.markdownPath).toBe(payload.data.paths.markdownPath);
      expect(payload.data.jsonPath).toMatch(/\.json$/);
      const markdown = await readFile(payload.data.paths.markdownPath, "utf8");
      expect(markdown).toContain("## Start Here");
      expect(markdown).toContain("## Agent Queue");
      expect(markdown).toContain("Suggested plan targets:");
    });
  });

  test("shared filters apply to report, list, next, and queue export", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--json"], repo);
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

  test("handoff warns for stale findings", async () => {
    await withTempRepo(async (repo) => {
      await writeFixtureSource(repo);
      await runCli(["scan", "--json"], repo);
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

      const result = await runCli(["scan", "--json"], repo);
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

  test("scan can synthesize candidates through a local Codex-compatible command", async () => {
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
const evidenceId = stdin.match(/"id": "(ev-[^"]+)"/)?.[1] || "ev-bad-id";
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
    evidenceIds: [evidenceId],
    whyItMatters: "Spread validation creates drift risk.",
    likelyRootCause: "Fast implementation duplicated the same pricing concept.",
    suggestedDirection: "Create one pricing calculation module and route both callers through it.",
    verification: ["npm test", "npm run typecheck"]
  }],
  rejectedEvidenceIds: [],
  notes: ["fake synthesis complete"]
}));
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { synthesis: { requested: boolean; candidateCount: number }; candidates: Array<{ provenance: { source: string } }> };
      };
      expect(payload.data.synthesis.requested).toBe(true);
      expect(payload.data.synthesis.candidateCount).toBe(1);
      expect(payload.data.candidates[0]?.provenance.source).toBe("model-synthesis");
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

      const result = await runCli(["scan", "--json"], repo);
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

      const result = await runCli(["scan", "--json"], repo);
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

      const result = await runCli(["scan", "--json"], repo);
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

      const result = await runCli(["scan", "--json"], repo);
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
    expect(plan.content.match(/src\/example\.ts:1-20/g)?.length).toBeLessThanOrEqual(3);
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

      await runCli(["scan", "--json"], repo);
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
    verification: ["npm test"]
  }],
  rejectedEvidenceIds: [],
  notes: []
}));
`);

      const result = await runCli(["scan", "--synthesize", "--json"], repo);
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        data: { synthesis: { candidateCount: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.diagnostics.some((item) => item.code === "synthesis_candidate_without_evidence")).toBe(true);
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
        data: { candidateCount: number; synthesis: { candidateCount: number } };
        diagnostics: Array<{ code: string }>;
      };
      expect(payload.data.candidateCount).toBeGreaterThan(0);
      expect(payload.data.synthesis.candidateCount).toBe(0);
      expect(payload.diagnostics.some((item) => item.code === "codex_synthesis_error")).toBe(true);
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
