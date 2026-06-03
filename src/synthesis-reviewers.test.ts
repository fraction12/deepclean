import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { defaultConfig } from "./defaults.js";
import {
  resolveReviewerPack,
  reviewerRubricVersion,
  reviewerRubricVersions,
  reviewerRubrics,
} from "./synthesis-reviewers.js";

describe("synthesis reviewer pack", () => {
  test("filters built-in reviewers by configured ids", async () => {
    const config = defaultConfig();
    config.reviewers.enabled = ["testability", "critic-pass"];

    const result = await resolveReviewerPack(process.cwd(), config);

    expect(result.diagnostics).toEqual([]);
    expect(result.rubrics.map((rubric) => rubric.id)).toEqual(["testability", "critic-pass"]);
  });

  test("reports unknown configured reviewer ids", async () => {
    const config = defaultConfig();
    config.reviewers.enabled = ["testability", "missing-reviewer"];

    const result = await resolveReviewerPack(process.cwd(), config);

    expect(result.rubrics.map((rubric) => rubric.id)).toEqual(["testability"]);
    expect(result.diagnostics).toEqual([expect.objectContaining({
      level: "warning",
      code: "reviewer_not_found",
      adapter: "codex-synthesis",
    })]);
  });

  test("loads custom reviewer files after built-in reviewers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "deepclean-reviewers-test-"));
    await writeFile(path.join(root, "custom-reviewer.md"), "Prefer small, evidence-backed cleanup slices.", "utf8");
    const config = defaultConfig();
    config.reviewers.enabled = ["critic-pass"];
    config.reviewers.customPaths = ["custom-reviewer.md"];

    const result = await resolveReviewerPack(root, config);

    expect(result.diagnostics).toEqual([]);
    expect(result.rubrics.map((rubric) => rubric.id)).toEqual(["critic-pass", "custom:custom-reviewer"]);
    expect(result.rubrics[1]).toEqual(expect.objectContaining({
      title: "Custom reviewer: custom-reviewer.md",
      purpose: "Prefer small, evidence-backed cleanup slices.",
    }));
  });

  test("reports unavailable custom reviewer files", async () => {
    const config = defaultConfig();
    config.reviewers.customPaths = ["missing-reviewer.md"];

    const result = await resolveReviewerPack(process.cwd(), config);

    expect(result.rubrics).toHaveLength(reviewerRubrics.length);
    expect(result.diagnostics).toEqual([expect.objectContaining({
      level: "warning",
      code: "custom_reviewer_unavailable",
      adapter: "codex-synthesis",
    })]);
  });

  test("maps rubric versions with the default reviewer version fallback", () => {
    expect(reviewerRubricVersions([
      { ...reviewerRubrics[0]!, version: "custom-version" },
      reviewerRubrics[1]!,
    ])).toEqual({
      [reviewerRubrics[0]!.id]: "custom-version",
      [reviewerRubrics[1]!.id]: reviewerRubricVersion,
    });
  });
});
