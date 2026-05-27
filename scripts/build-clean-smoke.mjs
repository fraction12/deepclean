import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileAsync } from "./shared/exec-file.mjs";

const root = process.cwd();
const sentinel = path.join(root, "dist", "deepclean-stale-sentinel.js");

await mkdir(path.dirname(sentinel), { recursive: true });
await writeFile(sentinel, "throw new Error('stale build output was packaged');\n");
await execFileAsync("npm", ["run", "build"], { cwd: root, maxBuffer: 1024 * 1024 });

try {
  await access(sentinel);
  throw new Error("npm run build did not remove stale dist output");
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
} finally {
  await rm(sentinel, { force: true });
}
