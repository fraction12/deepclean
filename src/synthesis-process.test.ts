import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runProcessWithRetries } from "./synthesis-process.js";

describe("synthesis provider process handling", () => {
  test("does not retry after a provider timeout", async () => {
    await withTempScript(`#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.argv[2], "attempt\\n");
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`, async (scriptPath, markerPath) => {
      const result = await runProcessWithRetries(process.execPath, [scriptPath, markerPath], "", 50, 2);

      expect(result.timedOut).toBe(true);
      expect(result.attempts).toBe(1);
      expect((await readFile(markerPath, "utf8")).trim().split("\n")).toEqual(["attempt"]);
    });
  });

  test("preserves timeout status when a provider exits zero during grace", async () => {
    await withTempScript(`#!/usr/bin/env node
process.on("SIGTERM", () => setTimeout(() => process.exit(0), 10));
setInterval(() => {}, 1000);
`, async (scriptPath, markerPath) => {
      const result = await runProcessWithRetries(process.execPath, [scriptPath, markerPath], "", 50, 2);

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.attempts).toBe(1);
    });
  });
});

async function withTempScript(
  contents: string,
  callback: (scriptPath: string, markerPath: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deepclean-synthesis-process-test-"));
  try {
    const scriptPath = path.join(dir, "provider.cjs");
    const markerPath = path.join(dir, "attempts.txt");
    await writeFile(scriptPath, contents, "utf8");
    await chmod(scriptPath, 0o755);
    await callback(scriptPath, markerPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
