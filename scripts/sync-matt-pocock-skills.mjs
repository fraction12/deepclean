import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoUrl = "https://github.com/mattpocock/skills";
const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "deepclean-matt-skills-"));
const cloneDir = path.join(temp, "skills");
const targetDir = path.join(root, "third_party", "matt-pocock-skills");

try {
  await execFileAsync("git", ["clone", "--depth", "1", repoUrl, cloneDir], { maxBuffer: 1024 * 1024 });
  const { stdout: shaOut } = await execFileAsync("git", ["-C", cloneDir, "rev-parse", "HEAD"]);
  const sha = shaOut.trim();

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(path.join(cloneDir, "skills"), path.join(targetDir, "skills"), { recursive: true });
  await cp(path.join(cloneDir, "docs"), path.join(targetDir, "docs"), { recursive: true });
  await cp(path.join(cloneDir, ".out-of-scope"), path.join(targetDir, "out-of-scope"), { recursive: true });
  for (const file of ["LICENSE", "README.md", "CONTEXT.md", "CLAUDE.md"]) {
    await cp(path.join(cloneDir, file), path.join(targetDir, file));
  }

  await writeFile(path.join(targetDir, "SNAPSHOT.md"), `# Matt Pocock Skills Snapshot

Source: ${repoUrl}
Snapshot commit: ${sha}
Snapshot date: 2026-05-24
License: MIT, Copyright (c) 2026 Matt Pocock

This directory is a vendored reference snapshot for Deepclean reviewer design. Runtime Codex synthesis does not load these files directly; Deepclean distills selected engineering practices into built-in reviewer rubrics so public-alpha scans remain reproducible and source-safe.
`, "utf8");

  console.log(`Synced Matt Pocock skills snapshot ${sha}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}

