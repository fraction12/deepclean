import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizePath } from "./discovery.js";
import { makeEvidence, type AdapterContext, type AdapterResult } from "./evidence-core.js";
import { stableId } from "./ids.js";
import type { EvidenceRecord } from "./types.js";

const execFileAsync = promisify(execFile);

export async function gitHistoryAdapter(context: AdapterContext): Promise<AdapterResult> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", context.root, "log", "--since=90 days ago", "--numstat", "--format=format:--commit--"],
      { maxBuffer: 1024 * 1024 * 10 },
    );
    const stats = new Map<string, { commits: number; changedLines: number }>();
    const seenInCommit = new Set<string>();

    for (const line of stdout.split(/\r?\n/)) {
      if (line === "--commit--") {
        for (const filePath of seenInCommit) {
          const current = stats.get(filePath) ?? { commits: 0, changedLines: 0 };
          current.commits += 1;
          stats.set(filePath, current);
        }
        seenInCommit.clear();
        continue;
      }

      const parts = line.split("\t");
      if (parts.length < 3) {
        continue;
      }
      const [addedRaw, removedRaw, filePathRaw] = parts;
      if (!addedRaw || !removedRaw || !filePathRaw) {
        continue;
      }
      const filePath = normalizePath(filePathRaw);
      if (!context.files.some((file) => file.path === filePath)) {
        continue;
      }
      const added = Number.parseInt(addedRaw, 10) || 0;
      const removed = Number.parseInt(removedRaw, 10) || 0;
      const current = stats.get(filePath) ?? { commits: 0, changedLines: 0 };
      current.changedLines += added + removed;
      stats.set(filePath, current);
      seenInCommit.add(filePath);
    }

    const evidence: EvidenceRecord[] = [];
    for (const [filePath, stat] of stats.entries()) {
      if (stat.commits < 4 && stat.changedLines < 180) {
        continue;
      }
      evidence.push(makeEvidence(context, {
        id: stableId("ev", `git-history:${filePath}:${stat.commits}:${stat.changedLines}`),
        adapter: "git-history",
        kind: "churn-hotspot",
        title: `High churn file: ${filePath}`,
        summary: `${filePath} changed in ${stat.commits} commits with ${stat.changedLines} changed lines over the last 90 days.`,
        files: [{ path: filePath }],
        data: stat,
        confidence: stat.commits >= 8 || stat.changedLines >= 400 ? "high" : "medium",
      }));
    }

    return { evidence, diagnostics: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git history is unavailable";
    const hasNoCommits = message.includes("does not have any commits yet");
    return {
      evidence: [],
      diagnostics: [{
        level: hasNoCommits ? "info" : "warning",
        code: "git_history_unavailable",
        message: hasNoCommits
          ? "Git history adapter skipped because this repository has no commits yet."
          : message,
        adapter: "git-history",
      }],
    };
  }
}
