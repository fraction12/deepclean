import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileAsync } from "./shared/exec-file.mjs";
import { packTarball } from "./shared/release-smoke-utils.mjs";

const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "deepclean-release-check-"));

const requiredBetaDogfoodSlots = [
  "deepclean",
  "lightningitb",
  "additional-1",
  "additional-2",
  "generated-noisy",
];

try {
  await enforceBetaDogfoodGate(root);

  const { stdout: validate } = await execFileAsync("node", ["scripts/spec-validate.mjs"], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  if (validate.includes("failed") && !validate.includes("0 failed")) {
    throw new Error(validate);
  }

  const { packedFiles } = await packTarball(root, temp);
  const forbiddenPatterns = [
    "/.deepclean/",
    "/.codex/",
    "/node_modules/",
    "/src/",
    "/third_party/",
    "/openspec/changes/",
    ".test.js",
    ".test.d.ts",
    ".test.js.map",
    "report-202",
    "plan-202",
  ];
  const forbidden = packedFiles.filter((file) => forbiddenPatterns.some((pattern) => file.includes(pattern)));
  if (forbidden.length > 0) {
    throw new Error(`Packed tarball contains release-forbidden files: ${forbidden.join(", ")}`);
  }

  const required = [
    "package/dist/cli.js",
    "package/README.md",
    "package/LICENSE",
    "package/CHANGELOG.md",
    "package/docs/beta-onboarding.md",
    "package/docs/privacy-and-trust.md",
    "package/docs/public-readiness.md",
    "package/docs/release.md",
    "package/docs/reviewer-references.md",
    "package/docs/troubleshooting.md",
  ];
  const missing = required.filter((file) => !packedFiles.includes(file));
  if (missing.length > 0) {
    throw new Error(`Packed tarball is missing required files: ${missing.join(", ")}`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

async function enforceBetaDogfoodGate(repoRoot) {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const releaseChannel = process.env.DEEPCLEAN_RELEASE_CHANNEL;
  const betaRequired = packageJson.version.includes("-beta")
    || releaseChannel === "beta"
    || process.env.DEEPCLEAN_REQUIRE_BETA_DOGFOOD === "1";
  if (!betaRequired) {
    return;
  }

  const scorecardDir = path.join(repoRoot, "docs", "beta-dogfood", "scorecards");
  let files = [];
  try {
    files = (await readdir(scorecardDir)).filter((file) => file.endsWith(".md"));
  } catch {
    throw new Error("Beta release blocked: docs/beta-dogfood/scorecards is missing.");
  }

  const slots = new Map();
  const failures = [];
  for (const file of files) {
    const body = await readFile(path.join(scorecardDir, file), "utf8");
    for (const entry of parseScorecardEntries(body)) {
      if (entry.gate !== "pass") {
        failures.push(`${entry.slot} in ${file} is ${entry.gate ?? "missing Gate"}`);
        continue;
      }
      slots.set(entry.slot, file);
    }
  }

  const missing = requiredBetaDogfoodSlots.filter((slot) => !slots.has(slot));
  if (missing.length > 0 || failures.length > 0) {
    throw new Error([
      "Beta release blocked by dogfood gate.",
      missing.length > 0 ? `Missing passing scorecards for: ${missing.join(", ")}` : undefined,
      failures.length > 0 ? `Failing scorecards: ${failures.join("; ")}` : undefined,
    ].filter(Boolean).join(" "));
  }
}

function parseScorecardEntries(body) {
  const entries = [];
  const sections = body.split(/^##\s+/m).flatMap((section, index) => index === 0 ? [] : [`## ${section}`]);
  for (const section of sections) {
    const slot = section.match(/(?:^|\n)-?\s*\*\*?Matrix Slot\*\*?:\s*`?([a-z0-9-]+)`?/i)?.[1]?.toLowerCase()
      ?? section.match(/(?:^|\n)-?\s*Matrix Slot:\s*`?([a-z0-9-]+)`?/i)?.[1]?.toLowerCase();
    if (!slot) {
      continue;
    }
    const gate = section.match(/(?:^|\n)-?\s*\*\*?Gate\*\*?:\s*`?([a-z-]+)`?/i)?.[1]?.toLowerCase()
      ?? section.match(/(?:^|\n)-?\s*Gate:\s*`?([a-z-]+)`?/i)?.[1]?.toLowerCase();
    entries.push({ slot, gate });
  }
  return entries;
}
