import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function usage() {
  return [
    "Usage:",
    "  node scripts/prepare-release.mjs --bump alpha|patch|minor|major",
    "  node scripts/prepare-release.mjs --version 0.1.0-alpha.1",
    "",
    "Options:",
    "  --bump <kind>       Version bump to apply when --version is not provided.",
    "  --version <version> Exact version to prepare.",
    "  --date <yyyy-mm-dd> Release date. Defaults to today.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { bump: "alpha", version: "", date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--bump" || arg === "--version" || arg === "--date") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      args[arg.slice(2)] = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }
  return args;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)\.(\d+))?$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prereleaseLabel: match[4] || "",
    prereleaseNumber: match[5] === undefined ? null : Number(match[5]),
  };
}

function formatVersion(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  if (!version.prereleaseLabel) {
    return base;
  }
  return `${base}-${version.prereleaseLabel}.${version.prereleaseNumber}`;
}

function nextVersion(currentVersion, bump) {
  const current = parseVersion(currentVersion);
  if (bump === "alpha") {
    if (current.prereleaseLabel === "alpha" && current.prereleaseNumber !== null) {
      return formatVersion({ ...current, prereleaseNumber: current.prereleaseNumber + 1 });
    }
    return formatVersion({
      major: current.major,
      minor: current.minor,
      patch: current.patch + (current.prereleaseLabel ? 0 : 1),
      prereleaseLabel: "alpha",
      prereleaseNumber: 0,
    });
  }
  if (bump === "patch") {
    return formatVersion({ major: current.major, minor: current.minor, patch: current.patch + 1, prereleaseLabel: "", prereleaseNumber: null });
  }
  if (bump === "minor") {
    return formatVersion({ major: current.major, minor: current.minor + 1, patch: 0, prereleaseLabel: "", prereleaseNumber: null });
  }
  if (bump === "major") {
    return formatVersion({ major: current.major + 1, minor: 0, patch: 0, prereleaseLabel: "", prereleaseNumber: null });
  }
  throw new Error(`Unsupported bump: ${bump}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function updateChangelog(version, date) {
  const changelogPath = path.join(root, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const unreleasedHeading = "## Unreleased";
  const start = changelog.indexOf(unreleasedHeading);
  if (start === -1) {
    throw new Error("CHANGELOG.md is missing an '## Unreleased' section");
  }
  const nextHeading = changelog.indexOf("\n## ", start + unreleasedHeading.length);
  if (nextHeading === -1) {
    throw new Error("CHANGELOG.md must contain at least one released version after '## Unreleased'");
  }

  const prefix = changelog.slice(0, start);
  const unreleasedBody = changelog.slice(start + unreleasedHeading.length, nextHeading).trim();
  const suffix = changelog.slice(nextHeading);
  if (!unreleasedBody) {
    throw new Error("CHANGELOG.md has no Unreleased entries to move into the release");
  }
  if (changelog.includes(`## ${version} - `)) {
    throw new Error(`CHANGELOG.md already contains a ${version} release section`);
  }

  const nextChangelog = [
    prefix.trimEnd(),
    "",
    unreleasedHeading,
    "",
    `## ${version} - ${date}`,
    "",
    unreleasedBody,
    suffix.trimEnd(),
    "",
  ].join("\n");
  fs.writeFileSync(changelogPath, nextChangelog);
}

const args = parseArgs(process.argv.slice(2));
const pkg = readJson("package.json");
const version = args.version || nextVersion(pkg.version, args.bump);
parseVersion(version);

pkg.version = version;
writeJson("package.json", pkg);

const lockPath = path.join(root, "package-lock.json");
if (fs.existsSync(lockPath)) {
  const lock = readJson("package-lock.json");
  lock.version = version;
  if (lock.packages?.[""]) {
    lock.packages[""].version = version;
  }
  writeJson("package-lock.json", lock);
}

updateChangelog(version, args.date);

console.log(`Prepared release ${version}`);
