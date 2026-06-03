import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteDir = path.join(root, "site");
const outDir = path.join(root, ".site-dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of ["index.html", "styles.css"]) {
  await cp(path.join(siteDir, entry), path.join(outDir, entry), {
    recursive: true,
  });
}

await mkdir(path.join(outDir, "assets"), { recursive: true });

for (const asset of [
  "cleeby-logo.png",
  "deepclean-launch.mp4",
  "deepclean-launch-poster.jpg",
]) {
  await cp(path.join(siteDir, "assets", asset), path.join(outDir, "assets", asset));
}

console.log(`Built GitHub Pages site at ${path.relative(root, outDir)}`);
