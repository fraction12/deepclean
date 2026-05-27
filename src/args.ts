export interface ParsedArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let command: string | undefined;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token.startsWith("--")) {
      const withoutPrefix = token.slice(2);
      const equalsIndex = withoutPrefix.indexOf("=");
      if (equalsIndex >= 0) {
        const key = withoutPrefix.slice(0, equalsIndex);
        const value = withoutPrefix.slice(equalsIndex + 1);
        flags[key] = value;
        continue;
      }

      const next = argv[index + 1];
      if (valueFlags.has(withoutPrefix)) {
        if (next && !next.startsWith("-")) {
          flags[withoutPrefix] = next;
          index += 1;
        } else {
          flags[withoutPrefix] = "";
        }
      } else {
        flags[withoutPrefix] = true;
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const shortFlags = token.slice(1).split("");
      for (const flag of shortFlags) {
        flags[flag] = true;
      }
      continue;
    }

    if (!command) {
      command = token;
    } else {
      positional.push(token);
    }
  }

  return command ? { command, positional, flags } : { positional, flags };
}

const valueFlags = new Set([
  "root",
  "state-dir",
  "config",
  "model",
  "status",
  "priority",
  "category",
  "risk",
  "source",
  "theme",
  "path",
  "lifecycle-state",
  "revalidation-state",
  "baseline-status",
  "note",
  "format",
  "since",
  "merge-base",
  "paths",
  "categories",
  "reviewers",
  "output",
  "sarif",
  "max-p0",
  "max-p1",
  "max-p2",
  "max-p3",
  "max-new-p0",
  "max-new-p1",
  "max-new-p2",
  "max-new-p3",
  "max-stale",
  "min-confidence",
  "fail-category",
]);

export function legacyParseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) {
      continue;
    }

    if (token.startsWith("--")) {
      const withoutPrefix = token.slice(2);
      const equalsIndex = withoutPrefix.indexOf("=");
      if (equalsIndex >= 0) {
        const key = withoutPrefix.slice(0, equalsIndex);
        const value = withoutPrefix.slice(equalsIndex + 1);
        flags[key] = value;
        continue;
      }

      const next = rest[index + 1];
      if (next && !next.startsWith("-")) {
        flags[withoutPrefix] = next;
        index += 1;
      } else {
        flags[withoutPrefix] = true;
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const shortFlags = token.slice(1).split("");
      for (const flag of shortFlags) {
        flags[flag] = true;
      }
      continue;
    }

    positional.push(token);
  }

  return command ? { command, positional, flags } : { positional, flags };
}

export function flagString(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function flagBoolean(
  flags: Record<string, string | boolean>,
  key: string,
): boolean {
  return flags[key] === true;
}
