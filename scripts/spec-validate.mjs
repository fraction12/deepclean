import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

try {
  const { stdout, stderr } = await execFileAsync("openspec", ["validate", "--all", "--no-interactive"], {
    maxBuffer: 1024 * 1024,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
} catch (error) {
  if (error?.code === "ENOENT" && process.env.CI) {
    console.log("openspec is not installed in this CI image; skipping OpenSpec validation.");
    process.exit(0);
  }
  throw error;
}
