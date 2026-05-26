import { createHash, randomUUID } from "node:crypto";

export function timestampId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${randomUUID().slice(0, 8)}`;
}

export function stableId(prefix: string, input: string, length = 10): string {
  const hash = createHash("sha1").update(input).digest("hex").slice(0, length);
  return `${prefix}-${hash}`;
}

export function candidateId(index: number): string {
  return `candidate-${String(index + 1).padStart(3, "0")}`;
}

export function clusterId(index: number): string {
  return `theme-${String(index + 1).padStart(3, "0")}`;
}
