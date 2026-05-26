import { readFile } from "node:fs/promises";
import path from "node:path";

export interface VerificationProfile {
  defaultCommands: string[];
  pythonCommands: string[];
  frontendCommands: string[];
  adminCommands: string[];
}

interface PackageJson {
  scripts?: Record<string, string>;
}

export async function inferVerificationProfile(root: string): Promise<VerificationProfile> {
  const [rootPackage, frontendPackage, adminPackage, makefile] = await Promise.all([
    readPackageJson(path.join(root, "package.json")),
    readPackageJson(path.join(root, "frontend", "package.json")),
    readPackageJson(path.join(root, "admin", "package.json")),
    readText(path.join(root, "Makefile")),
  ]);

  const rootCommands = packageCommands("", rootPackage);
  const frontendCommands = packageCommands("frontend", frontendPackage);
  const adminCommands = packageCommands("admin", adminPackage);
  const pythonCommands = makefile
    ? makeCommands(makefile)
    : [];

  return {
    defaultCommands: unique([
      ...rootCommands,
      ...pythonCommands,
      ...frontendCommands,
      ...adminCommands,
    ]).slice(0, 8),
    pythonCommands: pythonCommands.length > 0 ? pythonCommands : rootCommands,
    frontendCommands: frontendCommands.length > 0 ? frontendCommands : rootCommands,
    adminCommands: adminCommands.length > 0 ? adminCommands : rootCommands,
  };
}

export function commandsForFiles(
  profile: VerificationProfile,
  files: Array<{ path: string }>,
  fallback: string[] = [],
): string[] {
  const commands: string[] = [];
  const paths = files.map((file) => file.path);

  if (paths.some((filePath) => filePath.startsWith("admin/"))) {
    commands.push(...profile.adminCommands);
  }
  if (paths.some((filePath) => filePath.startsWith("frontend/"))) {
    commands.push(...profile.frontendCommands);
  }
  if (paths.some((filePath) => (
    filePath.endsWith(".py")
    || filePath.startsWith("backend/")
    || filePath.startsWith("core/")
    || filePath.startsWith("tests/")
  ))) {
    commands.push(...profile.pythonCommands);
  }

  const scoped = unique(commands).filter(Boolean);
  if (scoped.length > 0) {
    return scoped.slice(0, 6);
  }

  const defaults = profile.defaultCommands.length > 0 ? profile.defaultCommands : fallback;
  return unique(defaults.length > 0 ? defaults : fallback).slice(0, 6);
}

export function mergeVerificationCommands(
  inferred: string[],
  existing: string[],
): string[] {
  const generic = new Set(["npm test", "npm run typecheck", "make test", "make typecheck"]);
  const specific = existing.filter((command) => !generic.has(command));
  const preferred = inferred.length > 0 ? inferred : existing;
  return unique([...preferred, ...specific]).slice(0, 8);
}

function packageCommands(prefix: string, packageJson: PackageJson | undefined): string[] {
  const scripts = packageJson?.scripts;
  if (!scripts) {
    return [];
  }

  const commands: string[] = [];
  if (scripts["typecheck"]) {
    commands.push(npmCommand(prefix, "typecheck"));
  }
  if (scripts["lint"]) {
    commands.push(npmCommand(prefix, "lint"));
  }
  if (scripts["test:run"]) {
    commands.push(npmCommand(prefix, "test:run"));
  } else if (scripts["test"]) {
    commands.push(npmCommand(prefix, "test"));
  }
  if (scripts["build"]) {
    commands.push(npmCommand(prefix, "build"));
  }
  return commands;
}

function npmCommand(prefix: string, script: string): string {
  const command = `npm run ${script}`;
  return prefix ? `cd ${prefix} && ${command}` : command;
}

function makeCommands(makefile: string): string[] {
  const targets = new Set(
    makefile
      .split("\n")
      .map((line) => line.match(/^([a-zA-Z0-9_-]+):/)?.[1])
      .filter((value): value is string => Boolean(value)),
  );
  return ["lint", "typecheck", "test"]
    .filter((target) => targets.has(target))
    .map((target) => `make ${target}`);
}

async function readPackageJson(filePath: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

async function readText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
