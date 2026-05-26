import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sourceExtensions } from "./defaults.js";

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
  return files.sort((a, b) => a.path.localeCompare(b.path));
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
