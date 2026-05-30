import { describe, expect, test } from "vitest";
import {
  formatGithubOutputs,
  prereleaseLabel,
  resolveReleaseMetadata,
} from "./release-metadata.mjs";

describe("release metadata", () => {
  test("extracts prerelease labels", () => {
    expect(prereleaseLabel("0.1.0-alpha.3")).toBe("alpha");
    expect(prereleaseLabel("0.1.0-beta.5")).toBe("beta");
    expect(prereleaseLabel("0.1.0")).toBe("");
  });

  test("publishes beta under latest without post-publish promotion", () => {
    expect(resolveReleaseMetadata({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0-beta.6",
      githubRefName: "v0.1.0-beta.6",
      githubRefType: "tag",
    })).toEqual({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0-beta.6",
      npmTag: "latest",
      promotionTags: [],
    });
  });

  test("publishes alpha under alpha without latest promotion", () => {
    expect(resolveReleaseMetadata({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0-alpha.4",
    })).toMatchObject({
      npmTag: "alpha",
      promotionTags: [],
    });
  });

  test("publishes stable versions under latest without promotion", () => {
    expect(resolveReleaseMetadata({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0",
    })).toMatchObject({
      npmTag: "latest",
      promotionTags: [],
    });
  });

  test("respects explicit npm tag overrides without inferred promotion", () => {
    expect(resolveReleaseMetadata({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0-beta.6",
      inputNpmTag: "next",
    })).toMatchObject({
      npmTag: "next",
      promotionTags: [],
    });
  });

  test("rejects tag refs that do not match package version", () => {
    expect(() => resolveReleaseMetadata({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0-beta.6",
      githubRefName: "v0.1.0-beta.5",
      githubRefType: "tag",
    })).toThrow("does not match package version");
  });

  test("formats GitHub output values", () => {
    expect(formatGithubOutputs({
      packageName: "@fraction12/deepclean",
      packageVersion: "0.1.0-beta.6",
      npmTag: "latest",
      promotionTags: [],
    })).toContain("promotion_tags=\n");
  });
});
