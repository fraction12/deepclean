import type { ChildProcessWithoutNullStreams } from "node:child_process";

export function collectProcessOutput(child: ChildProcessWithoutNullStreams): {
  current: () => { stdout: string; stderr: string };
} {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return {
    current: () => ({ stdout, stderr }),
  };
}
