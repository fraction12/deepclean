import { z } from "zod";

export const diagnosticSchema = z.object({
  level: z.enum(["info", "warning", "error"]),
  code: z.string(),
  message: z.string(),
  adapter: z.string().optional(),
});

export type Diagnostic = z.infer<typeof diagnosticSchema>;

export interface CommandEnvelope<T> {
  ok: true;
  command: string;
  data: T;
  diagnostics: Diagnostic[];
}

export interface ErrorEnvelope {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
  };
  diagnostics: Diagnostic[];
}

export type JsonEnvelope<T> = CommandEnvelope<T> | ErrorEnvelope;

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
