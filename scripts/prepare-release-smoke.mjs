import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileAsync } from "./shared/exec-file.mjs";

const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "deepclean-prepare-release-smoke-"));

try {
  for (const file of ["package.json", "package-lock.json"]) {
    await cp(path.join(root, file), path.join(temp, file));
  }

  const pkgFixture = JSON.parse(await readFile(path.join(temp, "package.json"), "utf8"));
  pkgFixture.version = "1.2.3-alpha.4";
  await writeFile(path.join(temp, "package.json"), `${JSON.stringify(pkgFixture, null, 2)}\n`);

  const lockFixture = JSON.parse(await readFile(path.join(temp, "package-lock.json"), "utf8"));
  lockFixture.version = "1.2.3-alpha.4";
  if (lockFixture.packages?.[""]) {
    lockFixture.packages[""].version = "1.2.3-alpha.4";
  }
  await writeFile(path.join(temp, "package-lock.json"), `${JSON.stringify(lockFixture, null, 2)}\n`);

  await writeFile(
    path.join(temp, "CHANGELOG.md"),
    ["# Changelog", "", "## Unreleased", "", "- Added release automation.", "", "## 1.2.3-alpha.4 - 2026-05-26", "", "- Previous release.", ""].join("\n"),
  );

  await execFileAsync("node", [path.join(root, "scripts/prepare-release.mjs"), "--bump", "alpha", "--date", "2026-05-27"], {
    cwd: temp,
    maxBuffer: 1024 * 1024,
  });

  const pkg = JSON.parse(await readFile(path.join(temp, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(temp, "package-lock.json"), "utf8"));
  const changelog = await readFile(path.join(temp, "CHANGELOG.md"), "utf8");
  if (pkg.version !== "1.2.3-alpha.5") {
    throw new Error(`Expected package.json version 1.2.3-alpha.5, got ${pkg.version}`);
  }
  if (lock.version !== pkg.version || lock.packages[""].version !== pkg.version) {
    throw new Error("Expected package-lock versions to match package.json");
  }
  if (!changelog.includes("## 1.2.3-alpha.5 - 2026-05-27")) {
    throw new Error("Expected changelog release section for 1.2.3-alpha.5");
  }
  if (!/^## Unreleased\n\n## 1\.2\.3-alpha\.5/m.test(changelog)) {
    throw new Error("Expected Unreleased section to remain empty above the new release");
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
