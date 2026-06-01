import { describe, expect, test } from "vitest";
import { buildPrOpportunities } from "./opportunities.js";
import { schemaVersion, type CandidateRecord } from "./types.js";

describe("buildPrOpportunities", () => {
  test("recommends the safest narrow PR opportunity", () => {
    const opportunities = buildPrOpportunities({
      runId: "run-001",
      candidates: [
        candidate({ id: "candidate-001", priority: "P1", risk: "safe", title: "Split checkout formatter" }),
        candidate({ id: "candidate-002", priority: "P2", risk: "safe", title: "Split invoice formatter" }),
      ],
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    expect(opportunities[0]?.id).toBe("opportunity-001");
    expect(opportunities[0]?.classification).toBe("safe-narrow-pr");
    expect(opportunities[0]?.status).toBe("recommended");
    expect(opportunities[1]?.status).toBe("available");
  });

  test("routes unverified targets to tests-first", () => {
    const opportunities = buildPrOpportunities({
      runId: "run-001",
      candidates: [candidate({
        id: "candidate-001",
        readiness: undefined,
        verification: [],
        proofRequired: ["Pin current behavior first."],
      })],
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    expect(opportunities[0]?.classification).toBe("tests-first");
    expect(opportunities[0]?.testsRequiredFirst).toBe(true);
    expect(opportunities.at(-1)?.classification).toBe("stop-campaign");
  });

  test("routes design-needed targets to spec-design-first", () => {
    const opportunities = buildPrOpportunities({
      runId: "run-001",
      candidates: [candidate({
        id: "candidate-001",
        risk: "design-needed",
        readiness: "design-needed",
      })],
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    expect(opportunities[0]?.classification).toBe("spec-design-first");
    expect(opportunities[0]?.refusalReason).toContain("architecture/spec");
  });

  test("refuses sensitive targets as do-not-automate", () => {
    const opportunities = buildPrOpportunities({
      runId: "run-001",
      candidates: [candidate({
        id: "candidate-001",
        title: "Simplify auth token validation",
        files: [{ path: "src/auth/session.ts" }],
        ownedFiles: [{ path: "src/auth/session.ts" }],
      })],
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    expect(opportunities[0]?.classification).toBe("do-not-automate");
    expect(opportunities[0]?.refusalReason).toContain("sensitive");
  });

  test("rejects duplicate candidates", () => {
    const opportunities = buildPrOpportunities({
      runId: "run-001",
      candidates: [
        candidate({ id: "candidate-001", title: "Split checkout formatter", files: [{ path: "src/checkout.ts" }], ownedFiles: [{ path: "src/checkout.ts" }] }),
        candidate({ id: "candidate-002", title: "Split checkout formatter", files: [{ path: "src/checkout.ts" }], ownedFiles: [{ path: "src/checkout.ts" }] }),
      ],
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    const duplicate = opportunities.find((opportunity) => opportunity.targetCandidateIds.includes("candidate-002"));
    expect(duplicate?.classification).toBe("duplicate");
    expect(duplicate?.status).toBe("rejected");
  });

  test("adds a stop-campaign opportunity when no safe PR exists", () => {
    const opportunities = buildPrOpportunities({
      runId: "run-001",
      candidates: [
        candidate({ id: "candidate-001", readiness: "design-needed", risk: "design-needed" }),
        candidate({ id: "candidate-002", readiness: "split-needed", impact: "cross-cutting" }),
      ],
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    const stop = opportunities.find((opportunity) => opportunity.classification === "stop-campaign");
    expect(stop?.status).toBe("blocked");
    expect(stop?.rationale).toContain("No safe narrow PR opportunity");
  });
});

function candidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  const id = overrides.id ?? "candidate-001";
  const now = "2026-06-01T00:00:00.000Z";
  return {
    schemaVersion,
    recordType: "candidate",
    id,
    runId: "run-001",
    title: "Extract focused helper",
    category: "architecture",
    status: "open",
    priority: "P1",
    confidence: "high",
    impact: "local",
    effort: "small",
    risk: "safe",
    readiness: "fix-ready",
    files: [{ path: `src/${id}.ts` }],
    ownedFiles: [{ path: `src/${id}.ts` }],
    contextFiles: [],
    evidenceIds: [`ev-${id}`],
    affectedFeatureIds: [],
    featureScope: "feature-local",
    whyItMatters: "The code is easier to review when the responsibility is local.",
    likelyRootCause: "Fast iteration left helper logic inline.",
    suggestedDirection: "Extract a focused helper and keep existing callers compatible.",
    expectedBehavior: "Output stays identical.",
    proofRequired: [],
    nonGoals: [],
    doNotTouch: [],
    verification: ["npm test"],
    provenance: { source: "local-evidence" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
