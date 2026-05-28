import type { FileReference } from "./types.js";

export function uniqueFileReferences(files: FileReference[]): FileReference[] {
  const seen = new Set<string>();
  const unique: FileReference[] = [];
  for (const file of files) {
    const key = `${file.path}:${file.startLine ?? ""}:${file.endLine ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(file);
  }
  return unique;
}
