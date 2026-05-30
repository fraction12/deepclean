import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { type Diagnostic } from "./json.js";
import { type StatePaths } from "./state.js";

const stateWriterLockId = "state-writer";
const defaultStaleLockMs = 30 * 60 * 1000;
const defaultLockPollMs = 100;
const defaultLockTimeoutMs = 0;

export const lockRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("lock"),
  id: z.string(),
  owner: z.string(),
  pid: z.number().int().nonnegative(),
  command: z.string(),
  statePath: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});

export type LockRecord = z.infer<typeof lockRecordSchema>;

export class LockContentionError extends Error {
  readonly diagnostic: Diagnostic;
  readonly record?: LockRecord;
  readonly recoveryCommand: string;
  readonly stale: boolean;

  constructor(options: {
    message: string;
    record?: LockRecord | undefined;
    stale: boolean;
    recoveryCommand: string;
  }) {
    super(options.message);
    this.name = "LockContentionError";
    if (options.record) {
      this.record = options.record;
    }
    this.stale = options.stale;
    this.recoveryCommand = options.recoveryCommand;
    this.diagnostic = {
      level: "error",
      code: options.stale ? "stale_lock" : "lock_contention",
      message: options.message,
    };
  }
}

export interface LockStatus {
  filePath: string;
  record?: LockRecord;
  stale: boolean;
  reason?: string;
  recoveryCommand: string;
}

export async function withStateWriteLock<T>(
  paths: StatePaths,
  options: {
    command: string;
    wait?: boolean | undefined;
    timeoutMs?: number | undefined;
    staleAfterMs?: number | undefined;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const acquired = await acquireStateWriteLock(paths, options);
  try {
    return await fn();
  } finally {
    await releaseLock(acquired.filePath);
  }
}

export async function readLockStatuses(
  paths: StatePaths,
  options: { staleAfterMs?: number | undefined } = {},
): Promise<LockStatus[]> {
  let files: string[];
  try {
    files = (await readdir(paths.locksDir)).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }

  const statuses: LockStatus[] = [];
  for (const file of files) {
    const filePath = path.join(paths.locksDir, file);
    const record = await readLockFile(filePath);
    const stale = await lockIsStale(record, options.staleAfterMs);
    statuses.push({
      filePath,
      stale: stale.stale,
      recoveryCommand: recoveryCommand(paths),
      ...(record ? { record } : {}),
      ...(stale.reason ? { reason: stale.reason } : {}),
    });
  }
  return statuses.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

export async function recoverStaleLocks(
  paths: StatePaths,
  options: { staleAfterMs?: number | undefined } = {},
): Promise<{ removed: LockStatus[]; active: LockStatus[] }> {
  const statuses = await readLockStatuses(paths, options);
  const removed: LockStatus[] = [];
  const active: LockStatus[] = [];
  for (const status of statuses) {
    if (status.stale) {
      await releaseLock(status.filePath);
      removed.push(status);
    } else {
      active.push(status);
    }
  }
  return { removed, active };
}

export function lockRecoveryCommand(paths: StatePaths): string {
  return recoveryCommand(paths);
}

async function acquireStateWriteLock(
  paths: StatePaths,
  options: {
    command: string;
    wait?: boolean | undefined;
    timeoutMs?: number | undefined;
    staleAfterMs?: number | undefined;
  },
): Promise<{ filePath: string; record: LockRecord }> {
  await mkdir(paths.locksDir, { recursive: true });
  const filePath = path.join(paths.locksDir, `${stateWriterLockId}.json`);
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? defaultLockTimeoutMs;
  while (true) {
    try {
      const handle = await open(filePath, "wx");
      const now = new Date().toISOString();
      const record: LockRecord = {
        schemaVersion,
        recordType: "lock",
        id: stateWriterLockId,
        owner: `${os.userInfo().username}@${os.hostname()}`,
        pid: process.pid,
        command: options.command,
        statePath: paths.stateDir,
        createdAt: now,
      };
      lockRecordSchema.parse(record);
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.close();
      return { filePath, record };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      const existing = await readLockFile(filePath);
      const stale = await lockIsStale(existing, options.staleAfterMs);
      if (stale.stale) {
        throw new LockContentionError({
          message: `Stale Deepclean lock blocks writes at ${path.relative(paths.root, filePath)}. Run \`${recoveryCommand(paths)}\` before retrying.`,
          record: existing,
          stale: true,
          recoveryCommand: recoveryCommand(paths),
        });
      }
      if (!options.wait || Date.now() - startedAt >= timeoutMs) {
        throw new LockContentionError({
          message: `Another Deepclean writer is active${existing?.command ? ` (${existing.command})` : ""}. Retry after it exits or use --wait-lock.`,
          record: existing,
          stale: false,
          recoveryCommand: recoveryCommand(paths),
        });
      }
      await sleep(defaultLockPollMs);
    }
  }
}

async function readLockFile(filePath: string): Promise<LockRecord | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    return lockRecordSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

async function lockIsStale(
  record: LockRecord | undefined,
  staleAfterMs = defaultStaleLockMs,
): Promise<{ stale: boolean; reason?: string }> {
  if (!record) {
    return { stale: true, reason: "lock record is unreadable" };
  }
  const createdAt = Date.parse(record.createdAt);
  if (!Number.isFinite(createdAt)) {
    return { stale: true, reason: "lock timestamp is invalid" };
  }
  if (Date.now() - createdAt > staleAfterMs) {
    return { stale: true, reason: "lock exceeded stale threshold" };
  }
  if (!processIsAlive(record.pid)) {
    return { stale: true, reason: "lock process is not running" };
  }
  return { stale: false };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "EPERM") {
      return true;
    }
    return false;
  }
}

async function releaseLock(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function recoveryCommand(paths: StatePaths): string {
  const stateDir = path.relative(paths.root, paths.stateDir) || paths.stateDir;
  return `deepclean unlock --stale --state-dir ${stateDir}`;
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
