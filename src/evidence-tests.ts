import { isTestPath } from "./discovery.js";
import { makeEvidence, type AdapterContext, type AdapterResult } from "./evidence-core.js";
import { stableId } from "./ids.js";
import type { EvidenceRecord } from "./types.js";

export async function testDiscoveryAdapter(context: AdapterContext): Promise<AdapterResult> {
  const testFiles = context.files.filter((file) => isTestPath(file.path));
  const sourceFiles = context.files.filter((file) => !isTestPath(file.path));
  const testStems = new Set(testFiles.map((file) => stem(file.path)));
  const evidence: EvidenceRecord[] = [];

  for (const file of sourceFiles) {
    const nonBlank = file.lines.filter((line) => line.trim().length > 0).length;
    if (nonBlank < 90) {
      continue;
    }
    if (testStems.has(stem(file.path))) {
      continue;
    }
    evidence.push(makeEvidence(context, {
      id: stableId("ev", `test-discovery:${file.path}:${nonBlank}`),
      adapter: "test-discovery",
      kind: "test-gap",
      title: `No nearby test discovered: ${file.path}`,
      summary: `${file.path} has ${nonBlank} non-blank lines and no nearby test file discovered by naming convention.`,
      files: [{ path: file.path }],
      data: { nonBlankLines: nonBlank, discoveredTestFiles: testFiles.length },
      confidence: nonBlank >= 220 ? "medium" : "low",
    }));
  }

  return { evidence, diagnostics: [] };
}
export function stem(filePath: string): string {
  return filePath
    .replace(/(^|\/)(__tests__|test|tests|spec)\//g, "$1")
    .replace(/\.(test|spec)\.[cm]?[jt]sx?$/, "")
    .replace(/(^|\/)test_([^/]+)\.py$/, "$1$2")
    .replace(/_(test|tests)\.py$/, "")
    .replace(/\.py$/, "")
    .replace(/\.[cm]?[jt]sx?$/, "")
    .replace(/\/index$/, "");
}
