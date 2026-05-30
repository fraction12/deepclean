import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const marker = "<!-- octocheck:codex-review:v1 -->";

const args = parseArgs(process.argv.slice(2));
const root = await repoRoot();
const event = await readGithubEvent();
const pullRequest = event?.pull_request;
const repo = args.repo
  ?? event?.repository?.full_name
  ?? process.env.GITHUB_REPOSITORY
  ?? await repoFromOrigin(root);
const prNumber = args.pr
  ?? process.env.OCTOCHECK_PR_NUMBER
  ?? process.env.PR_NUMBER
  ?? event?.number?.toString()
  ?? prNumberFromRef(process.env.GITHUB_REF);
const baseName = args.base
  ?? pullRequest?.base?.ref
  ?? process.env.GITHUB_BASE_REF
  ?? "main";

await prepareGitForReview({ cwd: root, baseName, event, prNumber, repo });

const headSha = pullRequest?.head?.sha
  ?? process.env.GITHUB_SHA
  ?? await git(["rev-parse", "HEAD"], root).catch(() => "unknown");
const eventName = process.env.GITHUB_EVENT_NAME ?? "local";

if (isUntrustedFork(event) && process.env.OCTOCHECK_ALLOW_FORKS !== "true") {
  console.log("Octocheck Codex review skipped: pull request comes from a fork.");
  process.exit(0);
}

const baseRef = await resolveBaseRef(root, baseName);
const outputPath = path.resolve(root, args.output ?? ".octocheck/codex-review.md");

if (args.dryRun || process.env.OCTOCHECK_DRY_RUN === "true") {
  console.log(`Octocheck Codex review dry run`);
  console.log(`repo=${repo ?? "unknown"}`);
  console.log(`pr=${prNumber ?? "unknown"}`);
  console.log(`base=${baseRef}`);
  console.log(`head=${headSha.trim()}`);
  console.log(`output=${path.relative(root, outputPath)}`);
  process.exit(0);
}

const review = await runCodexReview(root, baseRef, buildReviewPrompt({ repo, prNumber, baseRef, headSha }));
await writeReviewOutput(outputPath, review);
console.log(review);

if (!args.noPost && process.env.OCTOCHECK_NO_POST !== "true") {
  await postReviewComment({
    repo,
    prNumber,
    body: buildCommentBody({
      review,
      baseRef,
      headSha: headSha.trim(),
      eventName,
    }),
  });
}

function parseArgs(values) {
  const parsed = {
    base: undefined,
    dryRun: false,
    noPost: false,
    output: undefined,
    pr: undefined,
    repo: undefined,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") {
      parsed.dryRun = true;
    } else if (value === "--no-post") {
      parsed.noPost = true;
    } else if (value === "--base") {
      parsed.base = requireValue(values, ++index, value);
    } else if (value === "--output") {
      parsed.output = requireValue(values, ++index, value);
    } else if (value === "--pr") {
      parsed.pr = requireValue(values, ++index, value);
    } else if (value === "--repo") {
      parsed.repo = requireValue(values, ++index, value);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return parsed;
}

function requireValue(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function repoRoot() {
  try {
    return (await git(["rev-parse", "--show-toplevel"], process.cwd())).trim();
  } catch {
    return path.dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
  }
}

async function readGithubEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }
  try {
    return JSON.parse(await readFile(eventPath, "utf8"));
  } catch (error) {
    console.warn(`Could not read GitHub event payload: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function isUntrustedFork(event) {
  const pull = event?.pull_request;
  const repository = event?.repository;
  if (!pull?.head?.repo?.full_name || !repository?.full_name) {
    return false;
  }
  return pull.head.repo.full_name !== repository.full_name;
}

async function repoFromOrigin(cwd) {
  try {
    const remote = (await git(["remote", "get-url", "origin"], cwd)).trim();
    const ssh = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    return ssh?.[1];
  } catch {
    return undefined;
  }
}

function prNumberFromRef(ref) {
  return ref?.match(/^refs\/pull\/(\d+)\//)?.[1];
}

async function prepareGitForReview({ cwd, baseName, event, prNumber, repo }) {
  await fetchRef(cwd, `${baseName}:refs/remotes/origin/${baseName}`);
  if (!prNumber) {
    return;
  }

  const prHeadRef = `refs/remotes/origin/pr/${prNumber}`;
  if (await fetchRef(cwd, `refs/pull/${prNumber}/head:${prHeadRef}`)) {
    await git(["checkout", "--detach", prHeadRef], cwd);
    return;
  }

  const head = event?.pull_request?.head;
  const baseRepo = event?.repository?.full_name ?? repo;
  if (head?.ref && (!head.repo?.full_name || head.repo.full_name === baseRepo)) {
    const headRef = `refs/remotes/origin/${head.ref}`;
    if (await fetchRef(cwd, `${head.ref}:${headRef}`)) {
      await git(["checkout", "--detach", headRef], cwd);
    }
  }
}

async function fetchRef(cwd, refspec) {
  try {
    await git(["fetch", "--no-tags", "--depth=200", "origin", refspec], cwd);
    return true;
  } catch (error) {
    console.warn(`Git fetch skipped for ${refspec}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function resolveBaseRef(cwd, baseName) {
  const candidates = [
    `origin/${baseName}`,
    `refs/remotes/origin/${baseName}`,
    baseName,
  ];
  for (const candidate of candidates) {
    if (await hasCommit(cwd, candidate)) {
      return candidate;
    }
  }
  await git(["fetch", "--no-tags", "--depth=200", "origin", `${baseName}:refs/remotes/origin/${baseName}`], cwd);
  return `origin/${baseName}`;
}

async function hasCommit(cwd, ref) {
  try {
    await git(["rev-parse", "--verify", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

function buildReviewPrompt({ repo, prNumber, baseRef, headSha }) {
  return [
    "Review this pull request for correctness bugs, behavioral regressions, security issues, and missing tests.",
    "Prioritize concrete, actionable findings. Do not comment on style-only issues.",
    "If there are no actionable findings, say that clearly.",
    "",
    `Repository: ${repo ?? "unknown"}`,
    `Pull request: ${prNumber ?? "unknown"}`,
    `Base ref: ${baseRef}`,
    `Head SHA: ${headSha.trim()}`,
  ].join("\n");
}

async function runCodexReview(cwd, baseRef, prompt) {
  const result = await spawnWithInput("codex", ["review", "--base", baseRef, "-"], prompt, cwd);
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n\n").trim();
  if (result.code !== 0) {
    throw new Error(`codex review failed with exit code ${result.code}\n${output}`);
  }
  return output || "Codex review completed with no output.";
}

async function writeReviewOutput(outputPath, review) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${review.trim()}\n`, "utf8");
}

function buildCommentBody({ review, baseRef, headSha, eventName }) {
  const relativeOutput = truncateForComment(review.trim());
  return `${marker}
## Octocheck Codex Review

- Base: \`${baseRef}\`
- Head: \`${headSha}\`
- Event: \`${eventName}\`

${relativeOutput}
`;
}

function truncateForComment(value) {
  const escaped = value.replaceAll("```", "'''");
  const maxLength = 55000;
  if (escaped.length <= maxLength) {
    return escaped;
  }
  return `${escaped.slice(0, maxLength)}

...truncated by Octocheck. See the Crabbox run log for full output.`;
}

async function postReviewComment({ repo, prNumber, body }) {
  if (!repo || !prNumber) {
    console.log("Skipping GitHub comment: repository or PR number was not available.");
    return;
  }
  if (!await commandWorks("gh", ["auth", "status"])) {
    console.log("Skipping GitHub comment: gh is unavailable or unauthenticated.");
    return;
  }

  const commentsJson = await exec("gh", [
    "api",
    "--paginate",
    `repos/${repo}/issues/${prNumber}/comments`,
  ], root);
  const comments = JSON.parse(commentsJson || "[]");
  const existing = comments.find((comment) => typeof comment.body === "string" && comment.body.includes(marker));
  const inputPath = path.join(os.tmpdir(), `octocheck-review-${process.pid}.json`);
  await writeFile(inputPath, JSON.stringify({ body }), "utf8");

  if (existing) {
    await exec("gh", ["api", "-X", "PATCH", `repos/${repo}/issues/comments/${existing.id}`, "--input", inputPath], root);
    console.log(`Updated Octocheck review comment on ${repo}#${prNumber}.`);
  } else {
    await exec("gh", ["api", "-X", "POST", `repos/${repo}/issues/${prNumber}/comments`, "--input", inputPath], root);
    console.log(`Posted Octocheck review comment on ${repo}#${prNumber}.`);
  }
}

async function commandWorks(command, commandArgs) {
  try {
    await exec(command, commandArgs, root);
    return true;
  } catch {
    return false;
  }
}

async function git(commandArgs, cwd) {
  return exec("git", commandArgs, cwd);
}

function exec(command, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, commandArgs, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${commandArgs.join(" ")} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function spawnWithInput(command, commandArgs, input, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}
