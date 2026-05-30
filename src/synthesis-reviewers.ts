import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DeepcleanConfig, Diagnostic } from "./types.js";

export const reviewerRubricVersion = "2026-05-29.beta-synthesis-quality-v1";

export interface ReviewerRubric {
  id: string;
  version?: string | undefined;
  title: string;
  basis?: string[];
  purpose: string;
  lookFor: string[];
  reject: string[];
  output: string[];
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
      "findings that explicitly choose fix-ready, split-needed, design-needed, needs-human, or defer",
      "candidate dependencies that should block or sequence later cleanup plans",
      "missing agent brief details: established facts, unresolved questions, constraints, verification, and expected output",
      "themes that should be split because they cross too many modules or require multiple decisions",
      "slices with a clear stop line, explicit non-goals, and behavior-preserving verification",
      "proof required to call the cleanup resolved and files the next agent owns",
      "do-not-touch boundaries where nearby refactors, public API changes, or unrelated generated code are risky",
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
      "include owned files, context files, non-goals, proof, and do-not-touch guidance",
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
      "a defensible split vs fix vs design-needed decision",
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

export async function resolveReviewerPack(
  root: string,
  config: DeepcleanConfig,
): Promise<{ rubrics: typeof reviewerRubrics; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const enabled = new Set(config.reviewers.enabled);
  const builtIn = reviewerRubrics.filter((rubric) => enabled.size === 0 || enabled.has(rubric.id));

  for (const id of enabled) {
    if (!reviewerRubrics.some((rubric) => rubric.id === id)) {
      diagnostics.push({
        level: "warning",
        code: "reviewer_not_found",
        message: `Configured reviewer is not built in and was ignored: ${id}`,
        adapter: "codex-synthesis",
      });
    }
  }

  const custom = [];
  for (const reviewerPath of config.reviewers.customPaths) {
    const resolved = path.resolve(root, reviewerPath);
    try {
      const body = await readFile(resolved, "utf8");
      custom.push({
        id: `custom:${path.basename(reviewerPath).replace(/\.[^.]+$/, "")}`,
        title: `Custom reviewer: ${reviewerPath}`,
        purpose: body.slice(0, 4000),
        lookFor: ["Follow the custom reviewer instructions."],
        reject: ["Reject findings not supported by evidence IDs."],
        output: ["Return bounded, agent-ready cleanup candidates."],
      });
    } catch (error) {
      diagnostics.push({
        level: "warning",
        code: "custom_reviewer_unavailable",
        message: `Could not load custom reviewer ${reviewerPath}: ${error instanceof Error ? error.message : String(error)}`,
        adapter: "codex-synthesis",
      });
    }
  }

  return { rubrics: [...builtIn, ...custom], diagnostics };
}


export function reviewerRubricVersions(rubrics: typeof reviewerRubrics): Record<string, string> {
  return Object.fromEntries(rubrics.map((rubric) => [rubric.id, rubric.version ?? reviewerRubricVersion]));
}
