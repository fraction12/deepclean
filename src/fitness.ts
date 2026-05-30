type EvidenceRecord = import("./types.js").EvidenceRecord;
type FindingRecord = import("./types.js").FindingRecord;
type RevalidationRecord = import("./types.js").RevalidationRecord;

type FitnessProgress = NonNullable<RevalidationRecord["progress"]>;

type FitnessMetricValue = {
  metric: string;
  unit: string;
  value: number;
};

export function fitnessProgressForFinding(
  finding: FindingRecord,
  previousEvidence: EvidenceRecord[],
  currentEvidence: EvidenceRecord[],
): FitnessProgress | undefined {
  const previous = previousEvidence
    .filter((record) => finding.evidenceIds.includes(record.id))
    .flatMap((record) => fitnessMetricValues(record).map((metric) => ({
      record,
      metric,
      key: metricComparisonKey(record),
    })))
    .filter((item) => item.key.length > 0);
  if (previous.length === 0 || currentEvidence.length === 0) {
    return undefined;
  }

  let best: FitnessProgress | undefined;
  for (const before of previous) {
    const candidates = currentEvidence
      .flatMap((record) => fitnessMetricValues(record).map((metric) => ({
        record,
        metric,
        key: metricComparisonKey(record),
      })))
      .filter((item) => (
        item.key === before.key
        && item.metric.metric === before.metric.metric
        && item.metric.unit === before.metric.unit
      ));
    for (const after of candidates) {
      const delta = before.metric.value - after.metric.value;
      if (delta <= 0) {
        continue;
      }
      const progress = {
        kind: "metric-reduction" as const,
        metric: before.metric.metric,
        unit: before.metric.unit,
        before: before.metric.value,
        after: after.metric.value,
        delta,
        evidenceIds: unique([before.record.id, after.record.id]),
      };
      if (!best || progress.delta > best.delta) {
        best = progress;
      }
    }
  }
  return best;
}

function fitnessMetricValues(record: EvidenceRecord): FitnessMetricValue[] {
  const values: FitnessMetricValue[] = [];
  const lines = record.data["lines"];
  if (typeof lines === "number" && Number.isFinite(lines)) {
    values.push({ metric: `${record.kind}.lines`, unit: "lines", value: lines });
  }
  const primary = record.files[0];
  if (
    values.length === 0
    && (record.kind === "large-function" || record.kind === "large-file")
    && typeof primary?.startLine === "number"
    && typeof primary.endLine === "number"
    && primary.endLine >= primary.startLine
  ) {
    values.push({
      metric: `${record.kind}.lines`,
      unit: "lines",
      value: primary.endLine - primary.startLine + 1,
    });
  }
  if (record.kind === "dependency-hotspot") {
    const incoming = record.data["incoming"];
    const outgoing = record.data["outgoing"];
    if (typeof incoming === "number" && Number.isFinite(incoming)) {
      values.push({ metric: "dependency-hotspot.incoming", unit: "dependencies", value: incoming });
    }
    if (typeof outgoing === "number" && Number.isFinite(outgoing)) {
      values.push({ metric: "dependency-hotspot.outgoing", unit: "dependencies", value: outgoing });
    }
  }
  if (record.kind === "code-graph-summary") {
    const cycleCount = record.data["cycleCount"];
    const policyViolationCount = record.data["policyViolationCount"];
    if (typeof cycleCount === "number" && Number.isFinite(cycleCount)) {
      values.push({ metric: "code-graph-summary.cycleCount", unit: "cycles", value: cycleCount });
    }
    if (typeof policyViolationCount === "number" && Number.isFinite(policyViolationCount)) {
      values.push({ metric: "code-graph-summary.policyViolationCount", unit: "violations", value: policyViolationCount });
    }
  }
  return values;
}

function metricComparisonKey(record: EvidenceRecord): string {
  const primary = record.files[0]?.path;
  if (!primary) {
    return "";
  }
  if (record.kind === "dependency-hotspot") {
    return `${record.kind}:${primary}`;
  }
  if (record.kind === "code-graph-summary") {
    return record.kind;
  }
  const symbol = record.data["name"];
  return [
    record.kind,
    primary,
    typeof symbol === "string" && symbol.trim().length > 0 ? symbol.trim() : normalizeEvidenceTitle(record.title),
  ].join(":");
}

function normalizeEvidenceTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
