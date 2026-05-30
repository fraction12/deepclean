import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { normalizePath } from "./discovery.js";
import { makeEvidence, type AdapterContext, type AdapterResult } from "./evidence-core.js";
import { stableId } from "./ids.js";
import type { EvidenceRecord } from "./types.js";

const execFileAsync = promisify(execFile);

export async function jscpdAdapter(context: AdapterContext): Promise<AdapterResult> {
  const settings = context.config.externalAnalyzers.jscpd;
  if (!settings.enabled) {
    return { evidence: [], diagnostics: [] };
  }

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-jscpd-"));
  try {
    await execFileAsync(settings.command, [
      "--silent",
      "--min-tokens",
      String(settings.minTokens),
      "--reporters",
      "json",
      "--output",
      outputDir,
      context.root,
    ], { maxBuffer: 1024 * 1024 * 20 });

    const report = await readFirstJsonReport(outputDir);
    const duplicates = Array.isArray(report["duplicates"]) ? report["duplicates"] : [];
    const sourcePathSet = new Set(context.files.map((file) => file.path));
    const evidence: EvidenceRecord[] = [];
    for (const duplicate of duplicates.slice(0, settings.maxFindings)) {
      if (!isObject(duplicate)) {
        continue;
      }
      const files = duplicateFiles(duplicate, context.root).filter((file) => sourcePathSet.has(file.path));
      const uniquePaths = new Set(files.map((file) => file.path));
      if (uniquePaths.size < 2) {
        continue;
      }
      const lines = typeof duplicate["lines"] === "number" ? duplicate["lines"] : undefined;
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `jscpd:${[...uniquePaths].join("|")}:${lines ?? ""}`),
        adapter: "jscpd",
        kind: "external-duplicate",
        title: `jscpd duplicate across ${uniquePaths.size} files`,
        summary: `jscpd reported a duplicate block across ${uniquePaths.size} files${lines ? ` spanning about ${lines} lines` : ""}.`,
        files,
        data: compactObject(duplicate, ["fragment"]),
        confidence: uniquePaths.size >= 3 ? "high" : "medium",
      }));
    }

    return { evidence, diagnostics: [] };
  } catch (error) {
    return {
      evidence: [],
      diagnostics: [{
        level: "info",
        code: "jscpd_unavailable",
        message: `jscpd adapter skipped: ${error instanceof Error ? error.message : String(error)}`,
        adapter: "jscpd",
      }],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export async function semgrepAdapter(context: AdapterContext): Promise<AdapterResult> {
  const settings = context.config.externalAnalyzers.semgrep;
  if (!settings.enabled) {
    return { evidence: [], diagnostics: [] };
  }

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-semgrep-"));
  const outputPath = path.join(outputDir, "semgrep.sarif");
  try {
    await execFileAsync(settings.command, [
      "scan",
      "--config",
      settings.config,
      "--sarif",
      "--output",
      outputPath,
      context.root,
    ], {
      maxBuffer: 1024 * 1024 * 20,
      timeout: settings.timeoutMs,
    });
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return {
      evidence: evidenceFromSarif(context, parsed, `semgrep:${settings.config}`).slice(0, settings.maxFindings),
      diagnostics: [],
    };
  } catch (error) {
    return {
      evidence: [],
      diagnostics: [{
        level: "info",
        code: "semgrep_unavailable",
        message: `Semgrep adapter skipped: ${error instanceof Error ? error.message : String(error)}`,
        adapter: "semgrep",
      }],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export async function sarifIngestAdapter(context: AdapterContext): Promise<AdapterResult> {
  const evidence: EvidenceRecord[] = [];
  for (const sarifPath of context.config.externalAnalyzers.sarifPaths) {
    const absolutePath = path.resolve(context.root, sarifPath);
    let raw: string;
    try {
      raw = await readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    const parsed = JSON.parse(raw) as unknown;
    evidence.push(...evidenceFromSarif(context, parsed, sarifPath));
  }

  return { evidence: evidence.slice(0, 80), diagnostics: [] };
}

export function evidenceFromSarif(context: AdapterContext, parsed: unknown, sarifPath: string): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = [];
  if (!isObject(parsed) || !Array.isArray(parsed["runs"])) {
    return evidence;
  }
  for (const run of parsed["runs"]) {
    if (!isObject(run) || !Array.isArray(run["results"])) {
      continue;
    }
    const toolName = sarifToolName(run);
    for (const result of run["results"].slice(0, 50)) {
      if (!isObject(result)) {
        continue;
      }
      const files = sarifFiles(result);
      if (files.length === 0) {
        continue;
      }
      const title = sarifTitle(result);
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `sarif:${sarifPath}:${title}:${files.map((file) => `${file.path}:${file.startLine ?? ""}`).join("|")}`),
        adapter: sarifPath.startsWith("semgrep:") ? "semgrep" : "sarif-ingest",
        kind: "sarif-finding",
        title,
        summary: `${toolName} reported ${title}.`,
        files,
        data: {
          sarifPath,
          toolName,
          ruleId: typeof result["ruleId"] === "string" ? result["ruleId"] : undefined,
          level: typeof result["level"] === "string" ? result["level"] : undefined,
        },
        confidence: sarifConfidence(result),
      }));
    }
  }
  return evidence;
}

export async function readFirstJsonReport(dir: string): Promise<Record<string, unknown>> {
  const files = await readdir(dir, { recursive: true });
  for (const file of files) {
    if (typeof file !== "string" || !file.endsWith(".json")) {
      continue;
    }
    const raw = await readFile(path.join(dir, file), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isObject(parsed)) {
      return parsed;
    }
  }
  return {};
}

export function duplicateFiles(value: Record<string, unknown>, root: string): Array<{ path: string; startLine?: number; endLine?: number }> {
  const result: Array<{ path: string; startLine?: number; endLine?: number }> = [];
  for (const key of ["firstFile", "secondFile"]) {
    const file = value[key];
    if (!isObject(file) || typeof file["name"] !== "string") {
      continue;
    }
    const reference: { path: string; startLine?: number; endLine?: number } = {
      path: normalizePath(path.relative(root, file["name"])),
    };
    if (typeof file["start"] === "number") {
      reference.startLine = file["start"];
    }
    if (typeof file["end"] === "number") {
      reference.endLine = file["end"];
    }
    result.push(reference);
  }
  return result;
}

export function sarifToolName(run: Record<string, unknown>): string {
  const tool = run["tool"];
  if (!isObject(tool)) {
    return "SARIF tool";
  }
  const driver = tool["driver"];
  if (!isObject(driver)) {
    return "SARIF tool";
  }
  return typeof driver["name"] === "string" ? driver["name"] : "SARIF tool";
}

export function sarifTitle(result: Record<string, unknown>): string {
  const message = result["message"];
  if (isObject(message) && typeof message["text"] === "string") {
    return message["text"].slice(0, 160);
  }
  if (typeof result["ruleId"] === "string") {
    return result["ruleId"];
  }
  return "External analyzer finding";
}

export function sarifFiles(result: Record<string, unknown>): Array<{ path: string; startLine?: number; endLine?: number }> {
  const locations = Array.isArray(result["locations"]) ? result["locations"] : [];
  const files: Array<{ path: string; startLine?: number; endLine?: number }> = [];
  for (const location of locations.slice(0, 5)) {
    if (!isObject(location)) {
      continue;
    }
    const physical = location["physicalLocation"];
    if (!isObject(physical)) {
      continue;
    }
    const artifact = physical["artifactLocation"];
    if (!isObject(artifact) || typeof artifact["uri"] !== "string") {
      continue;
    }
    const region = physical["region"];
    const reference: { path: string; startLine?: number; endLine?: number } = {
      path: normalizePath(decodeURIComponent(artifact["uri"])),
    };
    if (isObject(region) && typeof region["startLine"] === "number") {
      reference.startLine = region["startLine"];
    }
    if (isObject(region) && typeof region["endLine"] === "number") {
      reference.endLine = region["endLine"];
    }
    files.push(reference);
  }
  return files;
}

export function sarifConfidence(result: Record<string, unknown>): EvidenceRecord["confidence"] {
  const level = result["level"];
  if (level === "error") {
    return "high";
  }
  if (level === "warning") {
    return "medium";
  }
  return "low";
}

export function compactObject(value: Record<string, unknown>, omitKeys: string[]): Record<string, unknown> {
  const omitted = new Set(omitKeys);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!omitted.has(key)) {
      result[key] = item;
    }
  }
  return result;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
