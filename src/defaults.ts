import { z } from "zod";

export const stateDirName = ".deepclean";

export const schemaVersion = "0.1.0" as const;

export const configSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("config"),
  enabledAdapters: z.array(z.string()),
  exclude: z.array(z.string()),
  reviewSynthesis: z.object({
    enabled: z.boolean(),
    provider: z.literal("codex"),
    command: z.string(),
    model: z.string().optional(),
    effort: z.string().optional(),
    timeoutMs: z.number().int().positive(),
    retries: z.number().int().nonnegative(),
    rpm: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    tokenBudget: z.number().int().positive(),
    excerptBudget: z.number().int().nonnegative(),
    offline: z.boolean(),
    privacyMode: z.enum(["local-only", "metadata", "source-ok"]),
    maxCandidates: z.number().int().positive(),
  }),
  candidateCaps: z.object({
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byKindAndArea: z.record(z.string(), z.number().int().nonnegative()),
  }),
  clusters: z.object({
    maxCandidates: z.number().int().positive(),
    maxFiles: z.number().int().positive(),
    splitBroad: z.boolean(),
  }),
  architecture: z.object({
    layers: z.array(z.object({
      name: z.string().min(1),
      pathPatterns: z.array(z.string().min(1)).min(1),
    })),
    rules: z.array(z.object({
      from: z.string().min(1),
      allow: z.array(z.string().min(1)),
    })),
    maxCycles: z.number().int().nonnegative(),
    maxPolicyViolations: z.number().int().nonnegative(),
  }),
  reviewers: z.object({
    enabled: z.array(z.string()),
    customPaths: z.array(z.string()),
  }),
  externalAnalyzers: z.object({
    jscpd: z.object({
      enabled: z.boolean(),
      command: z.string(),
      minTokens: z.number().int().positive(),
      maxFindings: z.number().int().positive(),
    }),
    semgrep: z.object({
      enabled: z.boolean(),
      command: z.string(),
      config: z.string(),
      timeoutMs: z.number().int().positive(),
      maxFindings: z.number().int().positive(),
    }),
    sarifPaths: z.array(z.string()),
  }),
  privacy: z.object({
    allowSourceInModel: z.boolean(),
    allowWebResearch: z.boolean(),
  }),
  fixExecution: z.object({
    enabled: z.boolean(),
    verificationCommands: z.array(z.string()),
    maxAttempts: z.number().int().positive(),
    workerIdleTimeoutMs: z.number().int().positive(),
    workerHardTimeoutMs: z.number().int().positive(),
  }),
});

export type DeepcleanConfig = z.infer<typeof configSchema>;

export const defaultExcludeDirs = [
  ".git",
  ".deepclean",
  ".clawpatch",
  ".codex",
  ".claude",
  ".vercel",
  ".potato",
  "node_modules",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".venv",
  "venv",
  "dist",
  "build",
  "coverage",
  "generated",
  "__generated__",
  "output",
  ".next",
  ".turbo",
  ".cache",
  "vendor",
];

export const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
]);

export function defaultConfig(): DeepcleanConfig {
  return {
    schemaVersion,
    recordType: "config",
    enabledAdapters: [
      "file-metrics",
      "line-window-duplication",
      "semgrep",
      "sarif-ingest",
      "code-graph",
      "import-graph",
      "typescript-structure",
      "git-history",
      "test-discovery",
    ],
    exclude: defaultExcludeDirs,
    reviewSynthesis: {
      enabled: true,
      provider: "codex",
      command: "codex",
      timeoutMs: 120_000,
      retries: 0,
      rpm: 10,
      concurrency: 1,
      tokenBudget: 120_000,
      excerptBudget: 0,
      offline: false,
      privacyMode: "metadata",
      maxCandidates: 8,
    },
    candidateCaps: {
      byKind: {
        "duplicate-cluster": 16,
        "external-duplicate": 16,
        "sarif-finding": 24,
        "dependency-hotspot": 24,
        "dependency-cycle": 12,
        "architecture-boundary-violation": 24,
        "large-function": 24,
        "large-file": 24,
        "test-gap": 24,
        "churn-hotspot": 12,
        "shallow-wrapper-cluster": 16,
      },
      byKindAndArea: {
        "duplicate-cluster": 4,
        "external-duplicate": 4,
        "sarif-finding": 8,
        "dependency-hotspot": 8,
        "dependency-cycle": 4,
        "architecture-boundary-violation": 8,
        "large-function": 8,
        "large-file": 8,
        "test-gap": 8,
      },
    },
    clusters: {
      maxCandidates: 12,
      maxFiles: 18,
      splitBroad: true,
    },
    architecture: {
      layers: [],
      rules: [],
      maxCycles: 20,
      maxPolicyViolations: 40,
    },
    reviewers: {
      enabled: [
        "architecture-deepening",
        "deep-module-discipline",
        "duplication-consolidation",
        "dependency-graph",
        "testability",
        "feedback-loop-discipline",
        "domain-language",
        "agent-ready-slices",
        "ai-slop-patterns",
        "critic-pass",
      ],
      customPaths: [],
    },
    externalAnalyzers: {
      jscpd: {
        enabled: false,
        command: "jscpd",
        minTokens: 80,
        maxFindings: 20,
      },
      semgrep: {
        enabled: false,
        command: "semgrep",
        config: "auto",
        timeoutMs: 120_000,
        maxFindings: 80,
      },
      sarifPaths: [
        "semgrep.sarif",
        "semgrep-results.sarif",
        ".semgrep/semgrep.sarif",
        ".deepclean/input/semgrep.sarif",
      ],
    },
    privacy: {
      allowSourceInModel: false,
      allowWebResearch: false,
    },
    fixExecution: {
      enabled: false,
      verificationCommands: [],
      maxAttempts: 3,
      workerIdleTimeoutMs: 120_000,
      workerHardTimeoutMs: 1_800_000,
    },
  };
}
