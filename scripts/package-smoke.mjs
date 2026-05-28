import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileAsync } from "./shared/exec-file.mjs";
import { packTarball } from "./shared/release-smoke-utils.mjs";

const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "deepclean-package-smoke-"));

try {
  const { tarball, packedFiles } = await packTarball(root, temp);
  const forbidden = packedFiles.filter((file) => (
    file.includes("/.deepclean/")
    || file.includes("report-202")
    || file.includes("plan-202")
    || /\.test\.(js|d\.ts|js\.map)$/.test(file)
  ));
  if (forbidden.length > 0) {
    throw new Error(`Packed tarball contains forbidden local artifacts: ${forbidden.join(", ")}`);
  }

  const project = path.join(temp, "consumer");
  const target = path.join(temp, "target");
  await mkdir(path.join(target, "src"), { recursive: true });
  await writeFile(path.join(target, "src", "index.ts"), `
export function calculateTotal(items: Array<{ price: number }>) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const tax = subtotal * 0.07;
  return subtotal + tax;
}
`, "utf8");
  await mkdir(project, { recursive: true });
  await writeFile(path.join(project, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  await execFileAsync("npm", ["install", "--no-audit", "--no-fund", tarball], {
    cwd: project,
    maxBuffer: 1024 * 1024,
  });
  const bin = path.join(project, "node_modules", ".bin", "deepclean");
  const { stdout: version } = await execFileAsync(bin, ["--version"], { cwd: project });
  if (!version.trim()) {
    throw new Error("deepclean --version returned empty output");
  }
  await execFileAsync(bin, ["--root", target, "init", "--json"], { cwd: project });
  const { stdout: scan } = await execFileAsync(bin, ["--root", target, "scan", "--json"], {
    cwd: project,
    maxBuffer: 1024 * 1024,
  });
  const scanPayload = JSON.parse(scan);
  if (!scanPayload.ok || scanPayload.data.evidenceCount < 1) {
    throw new Error(`scan smoke failed: ${scan}`);
  }
  const { stdout: report } = await execFileAsync(bin, ["--root", target, "report", "--json"], {
    cwd: project,
    maxBuffer: 1024 * 1024,
  });
  const reportPayload = JSON.parse(report);
  if (!reportPayload.ok || !reportPayload.data.report.recommendations) {
    throw new Error(`report smoke failed: ${report}`);
  }
  const config = await readFile(path.join(target, ".deepclean", "config.json"), "utf8");
  if (!config.includes("candidateCaps") || !config.includes("reviewers") || !config.includes("externalAnalyzers")) {
    throw new Error("default config is missing public-alpha fields");
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
