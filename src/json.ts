import type { Diagnostic, ErrorEnvelope, JsonEnvelope } from "./types.js";

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

