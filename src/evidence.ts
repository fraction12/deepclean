import { jscpdAdapter, sarifIngestAdapter, semgrepAdapter } from "./evidence-external.js";
import { codeGraphAdapter, importGraphAdapter } from "./evidence-graph.js";
import { gitHistoryAdapter } from "./evidence-history.js";
import { duplicationAdapter, fileMetricsAdapter } from "./evidence-local.js";
import { typescriptStructureAdapter } from "./evidence-structure.js";
import { testDiscoveryAdapter } from "./evidence-tests.js";
import type { AdapterContext, AdapterResult, EvidenceAdapter } from "./evidence-core.js";
import type { Diagnostic } from "./json.js";
import type { EvidenceRecord } from "./types.js";

export type { AdapterContext, AdapterResult, EvidenceAdapter } from "./evidence-core.js";

export const evidenceAdapters: Record<string, EvidenceAdapter> = {
  "file-metrics": fileMetricsAdapter,
  "line-window-duplication": duplicationAdapter,
  "jscpd": jscpdAdapter,
  "semgrep": semgrepAdapter,
  "sarif-ingest": sarifIngestAdapter,
  "code-graph": codeGraphAdapter,
  "import-graph": importGraphAdapter,
  "typescript-structure": typescriptStructureAdapter,
  "git-history": gitHistoryAdapter,
  "test-discovery": testDiscoveryAdapter,
};

export async function runEvidenceAdapters(
  enabledAdapters: string[],
  context: AdapterContext,
): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const adapterName of enabledAdapters) {
    const adapter = evidenceAdapters[adapterName];
    if (!adapter) {
      diagnostics.push({
        level: "warning",
        code: "adapter_unknown",
        message: `Unknown evidence adapter: ${adapterName}`,
        adapter: adapterName,
      });
      continue;
    }

    try {
      const result = await adapter(context);
      evidence.push(...result.evidence);
      diagnostics.push(...result.diagnostics);
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "adapter_failed",
        message: error instanceof Error ? error.message : String(error),
        adapter: adapterName,
      });
    }
  }

  return { evidence, diagnostics };
}
