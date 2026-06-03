import { describe, expect, test } from "vitest";
import type { DeepcleanConfig } from "./defaults.js";
import type { SourceFile } from "./discovery.js";
import { testDiscoveryAdapter } from "./evidence-tests.js";

describe("test discovery evidence", () => {
  test("does not report scoped source test gaps when a nearby test exists in full context", async () => {
    const source = sourceFile("src/synthesis-chunks.ts", Array.from({ length: 120 }, (_, index) => `export const v${index} = ${index};`).join("\n"));
    const testFile = sourceFile("src/synthesis-chunks.test.ts", "import './synthesis-chunks.js';\n");

    const result = await testDiscoveryAdapter({
      root: "/repo",
      runId: "run-test",
      createdAt: "2026-06-03T00:00:00.000Z",
      files: [source],
      allFiles: [source, testFile],
      config: {} as DeepcleanConfig,
    });

    expect(result.evidence).toEqual([]);
  });
});

function sourceFile(filePath: string, text: string): SourceFile {
  return {
    path: filePath,
    absolutePath: `/repo/${filePath}`,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    text,
    lines: text.split(/\r?\n/),
  };
}
