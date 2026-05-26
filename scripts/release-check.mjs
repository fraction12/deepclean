import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "deepclean-release-check-"));

try {
  const { stdout: validate } = await execFileAsync("openspec", ["validate", "--all", "--no-interactive"], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  if (!validate.includes("0 failed")) {
    throw new Error(validate);
  }

  const { stdout: packStdout } = await execFileAsync("npm", ["pack", "--json", "--pack-destination", temp], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  const pack = JSON.parse(packStdout)[0];
  const tarball = path.join(temp, pack.filename);
  const { stdout: tarList } = await execFileAsync("tar", ["-tzf", tarball], { maxBuffer: 1024 * 1024 });
  const packedFiles = tarList.trim().split("\n");
  const forbiddenPatterns = [
    "/.deepclean/",
    "/.codex/",
    "/node_modules/",
    "/src/",
    "/third_party/",
    "/openspec/changes/",
    ".test.js",
    ".test.d.ts",
    ".test.js.map",
    "report-202",
    "plan-202",
  ];
  const forbidden = packedFiles.filter((file) => forbiddenPatterns.some((pattern) => file.includes(pattern)));
  if (forbidden.length > 0) {
    throw new Error(`Packed tarball contains release-forbidden files: ${forbidden.join(", ")}`);
  }

  const required = [
    "package/dist/cli.js",
    "package/README.md",
    "package/LICENSE",
    "package/CHANGELOG.md",
    "package/docs/privacy-and-trust.md",
    "package/docs/public-readiness.md",
    "package/docs/reviewer-references.md",
    "package/docs/troubleshooting.md",
  ];
  const missing = required.filter((file) => !packedFiles.includes(file));
  if (missing.length > 0) {
    throw new Error(`Packed tarball is missing required files: ${missing.join(", ")}`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
