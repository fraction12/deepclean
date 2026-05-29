import type { Diagnostic, ErrorEnvelope, JsonEnvelope } from "./types.js";

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function ok<T>(
  command: string,
  data: T,
  diagnostics: Diagnostic[] = [],
): JsonEnvelope<T> {
  return { ok: true, command, data, diagnostics };
}

export function fail(
  command: string,
  code: string,
  message: string,
  diagnostics: Diagnostic[] = [],
): ErrorEnvelope {
  return {
    ok: false,
    command,
    error: { code, message },
    diagnostics,
  };
}
