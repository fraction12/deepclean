import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sourceExtensions } from "./defaults.js";

const execFileAsync = promisify(execFile);

export interface SourceFile {
  path: string;
  absolutePath: string;
  extension: string;
  text: string;
  lines: string[];
}

export async function discoverSourceFiles(
  root: string,
  excludes: string[],
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const excludeSet = new Set(excludes);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeSet.has(entry.name)) {
        continue;
      }
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = path.extname(entry.name);
      if (!sourceExtensions.has(extension)) {
        continue;
      }
      const text = await readFile(absolutePath, "utf8");
      const relativePath = path.relative(root, absolutePath);
      files.push({
        path: normalizePath(relativePath),
        absolutePath,
        extension,
        text,
        lines: text.split(/\r?\n/),
      });
    }
  }

  await walk(root);
  const ignoredPaths = await gitIgnoredPaths(root, files.map((file) => file.path));
  return files
    .filter((file) => !ignoredPaths.has(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function gitIgnoredPaths(root: string, relativePaths: string[]): Promise<Set<string>> {
  const ignored = new Set<string>();
  for (let index = 0; index < relativePaths.length; index += 200) {
    const chunk = relativePaths.slice(index, index + 200);
    if (chunk.length === 0) {
      continue;
    }
    try {
      const { stdout } = await execFileAsync("git", ["check-ignore", "--", ...chunk], { cwd: root, timeout: 5000 });
      for (const filePath of String(stdout).split(/\r?\n/).filter(Boolean)) {
        ignored.add(normalizePath(filePath));
      }
    } catch (error) {
      const maybeOutput = error as { stdout?: unknown };
      if (typeof maybeOutput.stdout === "string" && maybeOutput.stdout.trim().length > 0) {
        for (const filePath of maybeOutput.stdout.split(/\r?\n/).filter(Boolean)) {
          ignored.add(normalizePath(filePath));
        }
      }
    }
  }
  return ignored;
}

export function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

export function isTestPath(filePath: string): boolean {
  return /(^|\/)(__tests__|test|tests|spec)\//.test(filePath)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)
    || /(^|\/)test_[^/]+\.py$/.test(filePath)
    || /(^|\/)[^/]+_(test|tests)\.py$/.test(filePath);
}
