import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfig } from "./defaults.js";
import { resolveStatePaths, type StatePaths } from "./state-paths.js";
import { configSchema, type DeepcleanConfig } from "./types.js";

export { resolveStatePaths };
export type { StatePaths };
export * from "./state-read.js";
export * from "./state-write.js";

export async function ensureState(paths: StatePaths): Promise<DeepcleanConfig> {
  await Promise.all([
    mkdir(paths.runsDir, { recursive: true }),
    mkdir(paths.findingsDir, { recursive: true }),
    mkdir(paths.observationsDir, { recursive: true }),
    mkdir(paths.featuresDir, { recursive: true }),
    mkdir(paths.evidenceDir, { recursive: true }),
    mkdir(paths.candidatesDir, { recursive: true }),
    mkdir(paths.clustersDir, { recursive: true }),
    mkdir(paths.reportsDir, { recursive: true }),
    mkdir(paths.triageDir, { recursive: true }),
    mkdir(paths.handoffsDir, { recursive: true }),
    mkdir(paths.plansDir, { recursive: true }),
    mkdir(paths.lifecycleDir, { recursive: true }),
    mkdir(paths.identityMatchesDir, { recursive: true }),
    mkdir(paths.revalidationsDir, { recursive: true }),
    mkdir(paths.ciDir, { recursive: true }),
    mkdir(paths.locksDir, { recursive: true }),
    mkdir(paths.retentionDir, { recursive: true }),
    mkdir(paths.fixesDir, { recursive: true }),
    mkdir(paths.synthesisDir, { recursive: true }),
  ]);

  try {
    return await readConfig(paths);
  } catch {
    const config = defaultConfig();
    await writeJson(paths.configPath, config);
    return config;
  }
}

export async function readConfig(paths: StatePaths): Promise<DeepcleanConfig> {
  const raw = await readFile(paths.configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<DeepcleanConfig>;
  return configSchema.parse(mergeConfig(defaultConfig(), parsed));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mergeConfig(defaults: DeepcleanConfig, value: Partial<DeepcleanConfig>): DeepcleanConfig {
  return {
    ...defaults,
    ...value,
    reviewSynthesis: {
      ...defaults.reviewSynthesis,
      ...value.reviewSynthesis,
    },
    candidateCaps: {
      byKind: {
        ...defaults.candidateCaps.byKind,
        ...value.candidateCaps?.byKind,
      },
      byKindAndArea: {
        ...defaults.candidateCaps.byKindAndArea,
        ...value.candidateCaps?.byKindAndArea,
      },
    },
    clusters: {
      ...defaults.clusters,
      ...value.clusters,
    },
    architecture: {
      ...defaults.architecture,
      ...value.architecture,
      layers: value.architecture?.layers ?? defaults.architecture.layers,
      rules: value.architecture?.rules ?? defaults.architecture.rules,
    },
    reviewers: {
      ...defaults.reviewers,
      ...value.reviewers,
    },
    externalAnalyzers: {
      jscpd: {
        ...defaults.externalAnalyzers.jscpd,
        ...value.externalAnalyzers?.jscpd,
      },
      semgrep: {
        ...defaults.externalAnalyzers.semgrep,
        ...value.externalAnalyzers?.semgrep,
      },
      sarifPaths: value.externalAnalyzers?.sarifPaths ?? defaults.externalAnalyzers.sarifPaths,
    },
    privacy: {
      ...defaults.privacy,
      ...value.privacy,
    },
    fixExecution: {
      ...defaults.fixExecution,
      ...value.fixExecution,
    },
  };
}
