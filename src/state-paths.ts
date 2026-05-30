import path from "node:path";
import { stateDirName } from "./defaults.js";

export interface StatePaths {
  root: string;
  stateDir: string;
  configPath: string;
  runsDir: string;
  findingsDir: string;
  observationsDir: string;
  featuresDir: string;
  evidenceDir: string;
  candidatesDir: string;
  clustersDir: string;
  reportsDir: string;
  triageDir: string;
  handoffsDir: string;
  plansDir: string;
  lifecycleDir: string;
  identityMatchesDir: string;
  revalidationsDir: string;
  ciDir: string;
  locksDir: string;
  retentionDir: string;
  fixesDir: string;
  synthesisDir: string;
}

export function resolveStatePaths(options: {
  cwd: string;
  root?: string | undefined;
  stateDir?: string | undefined;
  config?: string | undefined;
}): StatePaths {
  const root = path.resolve(options.cwd, options.root ?? ".");
  const stateDir = path.resolve(root, options.stateDir ?? stateDirName);
  return {
    root,
    stateDir,
    configPath: path.resolve(root, options.config ?? path.join(stateDir, "config.json")),
    runsDir: path.join(stateDir, "runs"),
    findingsDir: path.join(stateDir, "findings"),
    observationsDir: path.join(stateDir, "observations"),
    featuresDir: path.join(stateDir, "features"),
    evidenceDir: path.join(stateDir, "evidence"),
    candidatesDir: path.join(stateDir, "candidates"),
    clustersDir: path.join(stateDir, "clusters"),
    reportsDir: path.join(stateDir, "reports"),
    triageDir: path.join(stateDir, "triage"),
    handoffsDir: path.join(stateDir, "handoffs"),
    plansDir: path.join(stateDir, "plans"),
    lifecycleDir: path.join(stateDir, "lifecycle"),
    identityMatchesDir: path.join(stateDir, "identity-matches"),
    revalidationsDir: path.join(stateDir, "revalidations"),
    ciDir: path.join(stateDir, "ci"),
    locksDir: path.join(stateDir, "locks"),
    retentionDir: path.join(stateDir, "retention"),
    fixesDir: path.join(stateDir, "fixes"),
    synthesisDir: path.join(stateDir, "synthesis"),
  };
}
