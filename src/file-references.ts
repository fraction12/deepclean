import { z } from "zod";

export const fileReferenceSchema = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

export type FileReference = z.infer<typeof fileReferenceSchema>;

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
