import { candidateArea as surfaceArea } from "./candidates.js";
import type { CandidateRecord, EvidenceRecord, FileReference } from "./types.js";

export interface ReviewerRubric {
  id: string;
  title: string;
  basis?: string[];
  purpose: string;
  lookFor: string[];
  reject: string[];
  output: string[];
}

export interface CleanupSurface {
  id: string;
  title: string;
  focus: string;
  reviewerIds: string[];
  evidenceIds: string[];
  candidateIds: string[];
  files: FileReference[];
  signals: string[];
}

interface SurfaceDraft {
  key: string;
  title: string;
  focus: string;
  reviewerIds: Set<string>;
  evidenceIds: Set<string>;
  candidateIds: Set<string>;
  files: Map<string, FileReference>;
  signals: Set<string>;
  score: number;
}

export const reviewerRubrics: ReviewerRubric[] = [
  {
    id: "architecture-deepening",
    title: "Architecture and module deepening",
    basis: [
      "Deepclean native reviewer",
      "Matt Pocock skills: improve-codebase-architecture",
    ],
    purpose: "Find places where working code lacks real module boundaries, ownership, or durable seams.",
    lookFor: [
      "domain logic trapped in UI components, routes, scripts, or orchestration files",
      "large files acting as mixed controllers, services, DTO stores, and policy holders",
      "missing module boundaries where several files share one concept but no named home",
      "helper modules with many callers but unclear ownership or unstable APIs",
      "dependencies flowing from stable/domain code toward volatile UI/runtime code",
      "shallow modules whose interface is nearly as complex as their implementation",
      "modules that fail the deletion test because removing them would remove complexity rather than concentrate it",
    ],
    reject: [
      "single large file findings with no architectural consequence",
      "abstract advice to add layers without citing files and evidence",
      "renaming-only suggestions",
    ],
    output: [
      "name the missing or weak boundary",
      "explain the current ownership problem",
      "suggest the smallest durable module shape a future agent should investigate",
    ],
  },
  {
    id: "deep-module-discipline",
    title: "Deep module discipline",
    basis: [
      "Matt Pocock skills: improve-codebase-architecture/DEEPENING.md",
      "Matt Pocock skills: tdd/deep-modules.md",
    ],
    purpose: "Find cleanup work that would increase leverage and locality by moving complexity behind smaller, more durable interfaces.",
    lookFor: [
      "places where callers know too much about ordering, config, data shape, or error modes",
      "logic spread across shallow helper layers where each layer adds little leverage",
      "candidate modules where a small public interface could hide a larger implementation",
      "dependencies that should be classified before deepening: in-process, local-substitutable, remote owned, or true external",
      "seams that are only hypothetical because there is one adapter and no real second use such as tests",
      "tests that should move to the deepened module interface after shallow modules are collapsed",
    ],
    reject: [
      "suggestions to add interfaces or ports without evidence of two adapters or a real substitution need",
      "refactors that merely split files without improving leverage or locality",
      "test-only extractions that make production design shallower",
    ],
    output: [
      "state the interface pressure callers currently feel",
      "classify the dependency shape that constrains the cleanup",
      "recommend a small deepening step that improves both maintainability and testability",
    ],
  },
  {
    id: "duplication-consolidation",
    title: "Conceptual duplication and consolidation",
    purpose: "Find repeated behavior or policy that should become one source of truth.",
    lookFor: [
      "duplicate code blocks that reflect duplicated domain decisions",
      "same validation, formatting, permission, API, or config behavior across feature areas",
      "parallel frontend/admin/backend implementations that are likely to drift",
      "repeated literals or branching rules that encode the same concept",
    ],
    reject: [
      "incidental duplicated syntax with no shared domain meaning",
      "test fixture repetition",
      "framework boilerplate",
    ],
    output: [
      "identify the repeated concept",
      "state which callers must stay behaviorally compatible",
      "recommend the consolidation target without prescribing a broad rewrite",
    ],
  },
  {
    id: "dependency-graph",
    title: "Dependency graph and blast radius",
    purpose: "Use import/reference structure to find hotspots, direction problems, and risky cleanup order.",
    lookFor: [
      "files with high incoming and outgoing edges",
      "directories with high cross-boundary traffic",
      "central utility files that mix unrelated policies",
      "feature code importing across boundaries instead of through stable modules",
      "cleanup candidates that should be handled as a cluster because their graph is connected",
    ],
    reject: [
      "hotspot claims based only on file count",
      "dependency conclusions that ignore the supplied graph evidence",
    ],
    output: [
      "explain the graph shape and why it matters",
      "call out likely blast radius",
      "suggest a safe sequencing strategy for later cleanup",
    ],
  },
  {
    id: "testability",
    title: "Testability and verification gaps",
    basis: [
      "Deepclean native reviewer",
      "Matt Pocock skills: tdd",
      "Matt Pocock skills: diagnose",
    ],
    purpose: "Find cleanup work that needs tests or seams before agents can safely refactor.",
    lookFor: [
      "complex or central files without nearby tests",
      "logic embedded where it cannot be unit-tested directly",
      "duplicated behavior with no shared regression test",
      "clusters whose verification requires both typecheck and targeted tests",
      "missing fast deterministic feedback loops for risky cleanup",
      "tests coupled to implementation details rather than public behavior",
    ],
    reject: [
      "generic add-more-tests advice",
      "test gap claims for files already covered by obvious nearby tests unless evidence says otherwise",
    ],
    output: [
      "state the cleanup risk caused by the missing tests",
      "propose narrow regression checks",
      "include practical verification commands",
    ],
  },
  {
    id: "feedback-loop-discipline",
    title: "Feedback loop discipline",
    basis: [
      "Matt Pocock skills: diagnose",
      "Matt Pocock skills: tdd",
      "Matt Pocock skills: tdd/refactoring.md",
    ],
    purpose: "Find candidates where cleanup is unsafe until a future agent has a fast, behavior-level pass/fail loop.",
    lookFor: [
      "areas where the proposed cleanup needs one failing regression test or tracer-bullet test before refactoring",
      "bug-prone or high-churn code with no sharp verification command",
      "test suites that would break on implementation refactors while missing observable behavior",
      "cleanup candidates that need a minimal harness, CLI invocation, HTTP script, or browser check before changes",
      "places where duplication, primitive obsession, feature envy, or long methods are only safely addressable after green behavior coverage exists",
    ],
    reject: [
      "generic requests for more tests without naming the behavior and interface",
      "horizontal-slice plans that write many speculative tests before proving one path works",
      "verification plans that require manual inspection when an agent-runnable loop is plausible",
    ],
    output: [
      "name the first behavior-level feedback loop a future agent should build",
      "explain why cleanup is risky without that loop",
      "prefer one vertical tracer bullet over broad test-suite expansion",
    ],
  },
  {
    id: "domain-language",
    title: "Domain language and naming drift",
    basis: [
      "Deepclean native reviewer",
      "Matt Pocock skills: grill-with-docs",
    ],
    purpose: "Find places where the code lacks clear names for real concepts, causing sprawl.",
    lookFor: [
      "same concept represented by several names across UI, API, and services",
      "generic names like manager, helper, utils, data, handler, processor hiding domain policy",
      "business rules spread through technical plumbing instead of named domain modules",
      "missing glossary or context boundary that would help future agents avoid drift",
    ],
    reject: [
      "pure cosmetic naming preferences",
      "claims about product semantics not supported by paths, titles, or evidence summaries",
    ],
    output: [
      "name the likely domain concept",
      "identify where naming drift appears",
      "suggest what context or module name should be clarified",
    ],
  },
  {
    id: "agent-ready-slices",
    title: "Agent-ready cleanup slices",
    basis: [
      "Matt Pocock skills: to-issues",
      "Matt Pocock skills: triage",
      "Matt Pocock skills: handoff",
    ],
    purpose: "Keep synthesis output shaped as independently grabbable cleanup work for coding agents.",
    lookFor: [
      "findings that can be turned into a thin vertical slice with clear acceptance criteria",
      "cleanup work that is AFK-agent ready versus work needing human design judgment",
      "candidate dependencies that should block or sequence later cleanup plans",
      "missing agent brief details: established facts, unresolved questions, constraints, verification, and expected output",
      "themes that should be split because they cross too many modules or require multiple decisions",
      "slices with a clear stop line, explicit non-goals, and behavior-preserving verification",
      "small boundary extractions that make future work harder to break without rewriting the surrounding system",
    ],
    reject: [
      "broad modernization themes that no agent could complete in one bounded pass",
      "plans that describe layers to edit instead of end-to-end behavior to preserve",
      "findings with unresolved product or domain questions presented as ready-to-fix",
      "large-file or large-function findings with no proof of change pressure, bug proximity, missing tests, caller pain, or natural extraction boundary",
    ],
    output: [
      "state whether the candidate is agent-ready or design-needed",
      "name the narrowest useful slice a future agent can take",
      "include sequencing and blockers when the cleanup should not start immediately",
    ],
  },
  {
    id: "ai-slop-patterns",
    title: "AI-slop cleanup patterns",
    purpose: "Find code shapes that often result from fast agentic implementation and become expensive later.",
    lookFor: [
      "shallow wrappers that do not protect a real boundary",
      "copy-pasted near-solutions instead of shared policy",
      "overgrown files that mix fetching, mapping, validation, rendering, and error handling",
      "adapter layers that mirror implementation details without simplifying callers",
      "places where a future agent is likely to add another special case instead of improving structure",
    ],
    reject: [
      "vague accusations that code is AI-generated",
      "style-only complaints",
      "cleanup suggestions that would be larger than the evidence justifies",
    ],
    output: [
      "describe the slop shape in concrete engineering terms",
      "explain how it will get worse",
      "recommend a constrained cleanup direction",
    ],
  },
  {
    id: "critic-pass",
    title: "Finding quality critic",
    purpose: "Reject weak findings and keep only work an agent can act on with evidence.",
    lookFor: [
      "candidates supported by multiple evidence types or a strong graph/duplication signal",
      "clear impact, root cause, and future-agent handoff value",
      "bounded cleanup work rather than broad modernization",
      "proof that the cleanup improves reliability or future-change safety, not just aesthetics",
      "explicit non-goals that keep future agents from over-refactoring",
    ],
    reject: [
      "one-metric findings presented as architectural conclusions",
      "anything without valid evidence IDs",
      "claims that require reading source that was not provided",
      "recommendations to rewrite large areas without a staged verification plan",
      "themes masquerading as tasks when the next PR-sized slice is not named",
    ],
    output: [
      "prefer fewer stronger findings",
      "downgrade confidence when evidence is thin",
      "use notes for rejected evidence themes instead of forcing candidates",
    ],
  },
];

export function buildCleanupSurfaces(
  evidence: EvidenceRecord[],
  candidates: CandidateRecord[],
  limit = 12,
): CleanupSurface[] {
  const surfaces = new Map<string, SurfaceDraft>();

  for (const candidate of candidates) {
    const areas = candidate.files.length > 0
      ? unique(candidate.files.map((file) => surfaceArea(file.path)))
      : [`candidate:${candidate.category}`];
    for (const area of areas) {
      const surface = getSurface(surfaces, area);
      surface.candidateIds.add(candidate.id);
      surface.score += 6;
      surface.signals.add(`${candidate.priority} ${candidate.category}: ${candidate.title}`);
      for (const id of candidate.evidenceIds) {
        surface.evidenceIds.add(id);
      }
      for (const file of candidate.files) {
        addFile(surface, file);
      }
      for (const reviewerId of reviewersForCandidate(candidate)) {
        surface.reviewerIds.add(reviewerId);
      }
    }
  }

  for (const record of evidence) {
    const areas = evidenceAreas(record);
    for (const area of areas) {
      const surface = getSurface(surfaces, area);
      surface.evidenceIds.add(record.id);
      surface.score += scoreEvidence(record);
      surface.signals.add(`${record.kind}: ${record.title}`);
      for (const file of record.files) {
        addFile(surface, file);
      }
      for (const reviewerId of reviewersForEvidence(record)) {
        surface.reviewerIds.add(reviewerId);
      }
    }
  }

  addGraphDirectorySurfaces(surfaces, evidence);

  return [...surfaces.values()]
    .filter((surface) => surface.evidenceIds.size > 0 || surface.candidateIds.size > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((surface, index) => ({
      id: `surface-${String(index + 1).padStart(3, "0")}`,
      title: surface.title,
      focus: surface.focus,
      reviewerIds: [...surface.reviewerIds].sort(),
      evidenceIds: [...surface.evidenceIds].sort(),
      candidateIds: [...surface.candidateIds].sort(),
      files: [...surface.files.values()].slice(0, 12),
      signals: [...surface.signals].slice(0, 10),
    }));
}

function getSurface(surfaces: Map<string, SurfaceDraft>, key: string): SurfaceDraft {
  const existing = surfaces.get(key);
  if (existing) {
    return existing;
  }
  const surface: SurfaceDraft = {
    key,
    title: `Cleanup surface: ${key}`,
    focus: `Review ${key} as one maintainability surface, not as isolated files.`,
    reviewerIds: new Set(["critic-pass"]),
    evidenceIds: new Set(),
    candidateIds: new Set(),
    files: new Map(),
    signals: new Set(),
    score: 0,
  };
  surfaces.set(key, surface);
  return surface;
}

function addGraphDirectorySurfaces(surfaces: Map<string, SurfaceDraft>, evidence: EvidenceRecord[]): void {
  for (const record of evidence) {
    if (record.kind !== "code-graph-summary") {
      continue;
    }
    const directories = arrayOfRecords(record.data["directories"]);
    const hotspots = arrayOfRecords(record.data["hotspots"]);
    for (const directory of directories.slice(0, 12)) {
      const directoryPath = stringValue(directory["path"]);
      if (!directoryPath) {
        continue;
      }
      const fileCount = numberValue(directory["fileCount"]);
      const internalEdges = numberValue(directory["internalEdges"]);
      const incomingEdges = numberValue(directory["incomingEdges"]);
      const outgoingEdges = numberValue(directory["outgoingEdges"]);
      const graphScore = fileCount + internalEdges + incomingEdges + outgoingEdges;
      if (graphScore < 5) {
        continue;
      }
      const surface = getSurface(surfaces, directoryPath);
      surface.title = `Graph surface: ${directoryPath}`;
      surface.focus = "Review this directory as a graph-connected cleanup surface.";
      surface.evidenceIds.add(record.id);
      surface.reviewerIds.add("dependency-graph");
      surface.reviewerIds.add("architecture-deepening");
      surface.reviewerIds.add("deep-module-discipline");
      surface.score += graphScore;
      surface.signals.add(`graph: ${fileCount} files, ${internalEdges} internal edges, ${incomingEdges} incoming edges, ${outgoingEdges} outgoing edges`);
      for (const hotspot of hotspots) {
        const hotspotPath = stringValue(hotspot["path"]);
        if (hotspotPath?.startsWith(`${directoryPath}/`)) {
          addFile(surface, { path: hotspotPath, startLine: 1, endLine: 1 });
        }
      }
    }
  }
}

function evidenceAreas(record: EvidenceRecord): string[] {
  const fileAreas = record.files.map((file) => surfaceArea(file.path));
  if (fileAreas.length > 0) {
    return unique(fileAreas);
  }
  return [record.kind];
}

function addFile(surface: SurfaceDraft, file: FileReference): void {
  const existing = surface.files.get(file.path);
  if (existing) {
    const startLine = Math.min(existing.startLine ?? 1, file.startLine ?? 1);
    const endLine = Math.max(existing.endLine ?? 1, file.endLine ?? 1);
    surface.files.set(file.path, { path: file.path, startLine, endLine });
    return;
  }
  surface.files.set(file.path, {
    path: file.path,
    startLine: file.startLine ?? 1,
    endLine: file.endLine ?? 1,
  });
}

function reviewersForCandidate(candidate: CandidateRecord): string[] {
  switch (candidate.category) {
    case "architecture":
      return ["architecture-deepening", "deep-module-discipline", "dependency-graph"];
    case "complexity":
      return ["architecture-deepening", "deep-module-discipline", "testability", "feedback-loop-discipline"];
    case "duplication":
      return ["duplication-consolidation"];
    case "testability":
      return ["testability", "feedback-loop-discipline"];
    case "ai-slop":
      return ["ai-slop-patterns", "architecture-deepening", "agent-ready-slices"];
    case "domain-drift":
      return ["domain-language", "architecture-deepening"];
    case "dead-weight":
      return ["dependency-graph", "ai-slop-patterns", "agent-ready-slices"];
    case "diagnostic":
      return ["critic-pass"];
  }
}

function reviewersForEvidence(record: EvidenceRecord): string[] {
  switch (record.kind) {
    case "duplicate-cluster":
      return ["duplication-consolidation"];
    case "dependency-hotspot":
    case "code-graph-summary":
      return ["dependency-graph", "architecture-deepening", "deep-module-discipline"];
    case "large-file":
    case "complex-function":
      return ["architecture-deepening", "deep-module-discipline", "testability", "feedback-loop-discipline"];
    case "shallow-wrapper-cluster":
      return ["ai-slop-patterns", "architecture-deepening", "deep-module-discipline"];
    case "test-gap":
      return ["testability", "feedback-loop-discipline"];
    default:
      return ["critic-pass"];
  }
}

function scoreEvidence(record: EvidenceRecord): number {
  const confidenceScore = record.confidence === "high" ? 5 : record.confidence === "medium" ? 3 : 1;
  const kindScore = record.kind === "code-graph-summary" ? 4
    : record.kind === "duplicate-cluster" ? 5
      : record.kind === "dependency-hotspot" ? 4
        : 2;
  return confidenceScore + kindScore;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
