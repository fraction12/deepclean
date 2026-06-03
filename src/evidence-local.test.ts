import { describe, expect, test } from "vitest";
import type { DeepcleanConfig } from "./defaults.js";
import type { SourceFile } from "./discovery.js";
import { duplicationAdapter } from "./evidence-local.js";

describe("local evidence adapters", () => {
  test("ignores repeated switch mapping windows", async () => {
    const first = sourceFile("src/status-a.ts", `
export function mapA(value: string): string {
  switch (value) {
    case "partially-resolved":
      return "unresolved";
    case "still-open":
      return "unresolved";
    case "superseded":
      return "unresolved";
    case "stale":
      return "stale";
    case "inconclusive":
      return "inconclusive";
  }
}
`);
    const second = sourceFile("src/status-b.ts", first.text.replace("mapA", "mapB"));

    const result = await duplicationAdapter(context([first, second]));

    expect(result.evidence).toEqual([]);
  });

  test("keeps repeated executable logic windows", async () => {
    const body = `
export function calculate(value: number): number {
  const base = value + 1;
  const doubled = base * 2;
  const rounded = Math.round(doubled);
  if (rounded > 10) {
    return rounded - 1;
  }
  return rounded;
}
`;
    const result = await duplicationAdapter(context([
      sourceFile("src/calc-a.ts", body.replace("calculate", "calculateA")),
      sourceFile("src/calc-b.ts", body.replace("calculate", "calculateB")),
    ]));

    expect(result.evidence.length).toBeGreaterThanOrEqual(1);
    expect(result.evidence[0]?.kind).toBe("duplicate-cluster");
  });
});

function context(files: SourceFile[]) {
  return {
    root: "/repo",
    runId: "run-test",
    createdAt: "2026-06-03T00:00:00.000Z",
    files,
    config: {} as DeepcleanConfig,
  };
}

function sourceFile(filePath: string, text: string): SourceFile {
  return {
    path: filePath,
    absolutePath: `/repo/${filePath}`,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    text,
    lines: text.trim().split(/\r?\n/),
  };
}
