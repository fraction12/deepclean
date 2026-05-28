import path from "node:path";
import { execFileAsync } from "./exec-file.mjs";

export async function packTarball(root, destination) {
  const { stdout: packStdout } = await execFileAsync("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  const pack = JSON.parse(packStdout)[0];
  const tarball = path.join(destination, pack.filename);
  const { stdout: tarList } = await execFileAsync("tar", ["-tzf", tarball], { maxBuffer: 1024 * 1024 });

  return {
    tarball,
    packedFiles: tarList.trim().split("\n"),
  };
}
