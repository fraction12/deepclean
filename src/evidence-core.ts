import { schemaVersion } from "./defaults.js";
import type { SourceFile } from "./discovery.js";
import type { Diagnostic } from "./json.js";
import type { DeepcleanConfig, EvidenceRecord } from "./types.js";

export interface AdapterContext {
  root: string;
  runId: string;
  createdAt: string;
  files: SourceFile[];
  config: DeepcleanConfig;
}

export interface AdapterResult {
  evidence: EvidenceRecord[];
  diagnostics: Diagnostic[];
}

export type EvidenceAdapter = (context: AdapterContext) => Promise<AdapterResult>;

export function makeEvidence(
  context: AdapterContext,
  values: Omit<EvidenceRecord, "schemaVersion" | "recordType" | "runId" | "createdAt" | "affectedFeatureIds" | "fileRoles"> &
    Partial<Pick<EvidenceRecord, "affectedFeatureIds" | "fileRoles">>,
): EvidenceRecord {
  return {
    schemaVersion,
    recordType: "evidence",
    runId: context.runId,
    createdAt: context.createdAt,
    affectedFeatureIds: [],
    fileRoles: [],
    ...values,
  };
}
