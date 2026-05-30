import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function prereleaseLabel(version) {
  const prerelease = version.includes("-") ? version.split("-")[1] : "";
  return prerelease ? prerelease.split(".")[0] : "";
}

export function resolveReleaseMetadata({
  packageName,
  packageVersion,
  inputNpmTag = "",
  githubRefName = "",
  githubRefType = "",
}) {
  if (!packageName) {
    throw new Error("packageName is required");
  }
  if (!packageVersion) {
    throw new Error("packageVersion is required");
  }

  const expectedGitTag = `v${packageVersion}`;
  if (githubRefType === "tag" && githubRefName !== expectedGitTag) {
    throw new Error(`Tag ${githubRefName} does not match package version ${expectedGitTag}`);
  }

  const explicitNpmTag = inputNpmTag.trim();
  const label = prereleaseLabel(packageVersion);
  const npmTag = explicitNpmTag || label || "latest";
  const promotionTags = explicitNpmTag || label !== "beta" ? [] : ["latest"];

  return {
    packageName,
    packageVersion,
    npmTag,
    promotionTags,
  };
}

export function formatGithubOutputs(metadata) {
  return [
    `package_name=${metadata.packageName}`,
    `package_version=${metadata.packageVersion}`,
    `npm_tag=${metadata.npmTag}`,
    `promotion_tags=${metadata.promotionTags.join(" ")}`,
    "",
  ].join("\n");
}

function readPackageJson(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function main() {
  const pkg = readPackageJson("package.json");
  const metadata = resolveReleaseMetadata({
    packageName: pkg.name,
    packageVersion: pkg.version,
    inputNpmTag: process.env.INPUT_NPM_TAG || "",
    githubRefName: process.env.GITHUB_REF_NAME || "",
    githubRefType: process.env.GITHUB_REF_TYPE || "",
  });
  const output = formatGithubOutputs(metadata);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
    return;
  }
  process.stdout.write(output);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
