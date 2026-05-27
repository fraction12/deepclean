import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteDir = path.join(root, "site");
const outDir = path.join(root, ".site-dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of ["index.html", "styles.css", "constellation.js", "assets"]) {
  await cp(path.join(siteDir, entry), path.join(outDir, entry), {
    recursive: true,
  });
}

console.log(`Built GitHub Pages site at ${path.relative(root, outDir)}`);
