import { isTestPath, type SourceFile } from "./discovery.js";
import { makeEvidence, type AdapterContext, type AdapterResult } from "./evidence-core.js";
import { stableId } from "./ids.js";
import type { EvidenceRecord } from "./types.js";

export async function fileMetricsAdapter(context: AdapterContext): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];

  for (const file of context.files) {
    const nonBlank = file.lines.filter((line) => line.trim().length > 0).length;
    if (nonBlank < 220) {
      continue;
    }

    evidence.push(makeEvidence(context, {
      id: stableId("ev", `file-metrics:${file.path}:${nonBlank}`),
      adapter: "file-metrics",
      kind: "large-file",
      title: `Large source file: ${file.path}`,
      summary: `${file.path} has ${nonBlank} non-blank lines, which is a useful maintainability hotspot for review.`,
      files: [{ path: file.path, startLine: 1, endLine: file.lines.length }],
      data: { nonBlankLines: nonBlank, totalLines: file.lines.length },
      confidence: nonBlank >= 500 ? "high" : "medium",
    }));
  }

  return { evidence, diagnostics: [] };
}

export async function duplicationAdapter(context: AdapterContext): Promise<AdapterResult> {
  const windows = new Map<string, Array<{ file: SourceFile; startLine: number; text: string }>>();
  const windowSize = 6;

  for (const file of context.files.filter((item) => !isTestPath(item.path))) {
    const normalized = file.lines.map((line) => line
      .trim()
      .replace(/\s+/g, " ")
      .replace(/["'`][^"'`]*["'`]/g, "<string>")
      .replace(/\b\d+(?:\.\d+)?\b/g, "<number>"));
    for (let index = 0; index <= normalized.length - windowSize; index += 1) {
      const slice = normalized.slice(index, index + windowSize);
      if (slice.filter(Boolean).length < windowSize) {
        continue;
      }
      if (slice.every((line) => /^["'`<][^=({]*["'`>]?,?$/.test(line.trim()))) {
        continue;
      }
      if (isSwitchMappingWindow(slice)) {
        continue;
      }
      if (slice.filter((line) => /[=({.]|return|if |for |while /.test(line)).length < 3) {
        continue;
      }
      const key = slice.join("\n");
      const existing = windows.get(key) ?? [];
      existing.push({
        file,
        startLine: index + 1,
        text: file.lines.slice(index, index + windowSize).join("\n"),
      });
      windows.set(key, existing);
    }
  }

  const evidence: EvidenceRecord[] = [];
  for (const [key, matches] of windows.entries()) {
    const uniqueFiles = new Set(matches.map((match) => match.file.path));
    if (uniqueFiles.size < 2) {
      continue;
    }
    const selected = firstMatchPerFile(matches).slice(0, 5);
    evidence.push(makeEvidence(context, {
      id: stableId("ev", `duplication:${key}`),
      adapter: "line-window-duplication",
      kind: "duplicate-cluster",
      title: `Repeated code block across ${uniqueFiles.size} files`,
      summary: `A repeated ${windowSize}-line normalized code block appears in ${uniqueFiles.size} files.`,
      files: selected.map((match) => ({
        path: match.file.path,
        startLine: match.startLine,
        endLine: match.startLine + windowSize - 1,
      })),
      data: {
        occurrences: matches.length,
        uniqueFiles: [...uniqueFiles],
        sample: selected[0]?.text ?? "",
      },
      confidence: uniqueFiles.size >= 3 ? "high" : "medium",
    }));
    if (evidence.length >= 25) {
      break;
    }
  }

  return { evidence, diagnostics: [] };
}

function isSwitchMappingWindow(lines: string[]): boolean {
  const mappingLines = lines.filter((line) => /^case\b.*:$/.test(line) || /^return\b[^;]*;$/.test(line));
  if (mappingLines.length < 4) {
    return false;
  }
  return lines.every((line) => /^switch\b.*\{$/.test(line)
    || /^case\b.*:$/.test(line)
    || /^return\b[^;]*;$/.test(line)
    || line === "}");
}

export function firstMatchPerFile(
  matches: Array<{ file: SourceFile; startLine: number; text: string }>,
): Array<{ file: SourceFile; startLine: number; text: string }> {
  const selected = new Map<string, { file: SourceFile; startLine: number; text: string }>();
  for (const match of matches) {
    if (!selected.has(match.file.path)) {
      selected.set(match.file.path, match);
    }
  }
  return [...selected.values()];
}
