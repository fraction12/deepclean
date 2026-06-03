import { spawn } from "node:child_process";
import { collectProcessOutput } from "./process-output.js";

const terminationGraceMs = 1000;

async function runProcess(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; providerUnavailable: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    let providerUnavailable = false;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const output = collectProcessOutput(child);
    let killTimer: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, terminationGraceMs);
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      const { stdout, stderr } = output.current();
      providerUnavailable = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      resolve({ exitCode: 1, stdout, stderr: error.message, timedOut, providerUnavailable });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      const { stdout, stderr } = output.current();
      resolve({ exitCode, stdout, stderr, timedOut, providerUnavailable });
    });
    child.stdin.end(stdin);
  });
}

export async function runProcessWithRetries(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  retries: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; providerUnavailable: boolean; attempts: number }> {
  let last = await runProcess(command, args, stdin, timeoutMs);
  let attempts = 1;
  while (last.exitCode !== 0 && !last.timedOut && attempts <= retries && !last.providerUnavailable) {
    attempts += 1;
    last = await runProcess(command, args, stdin, timeoutMs);
  }
  return { ...last, attempts };
}

export function codexFailureMessage(result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; attempts?: number | undefined }): string {
  if (result.timedOut) {
    return `Codex synthesis timed out before returning schema-valid JSON after ${result.attempts ?? 1} attempt(s).`;
  }
  const text = result.stderr || result.stdout || `Codex exited with code ${result.exitCode}`;
  if (/not found|ENOENT/i.test(text)) {
    return `Codex command was unavailable: ${text}`;
  }
  if (/auth|login|unauthori[sz]ed|api key/i.test(text)) {
    return `Codex appears unauthenticated: ${text}`;
  }
  return text;
}
