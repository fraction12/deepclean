import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { execFileAsync } from "./shared/exec-file.mjs";
import { packTarball } from "./shared/release-smoke-utils.mjs";

const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "deepclean-release-check-"));

try {
  const { stdout: validate } = await execFileAsync("node", ["scripts/spec-validate.mjs"], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  if (validate.includes("failed") && !validate.includes("0 failed")) {
    throw new Error(validate);
  }

  const { packedFiles } = await packTarball(root, temp);
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
    "package/docs/release.md",
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
