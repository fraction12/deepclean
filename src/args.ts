export interface ParsedArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | string[] | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let command: string | undefined;
  const positional: string[] = [];
  const flags: Record<string, string | string[] | boolean> = {};

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
        assignFlag(flags, key, value);
        continue;
      }

      const next = argv[index + 1];
      if (valueFlags.has(withoutPrefix)) {
        if (next && !next.startsWith("-")) {
          assignFlag(flags, withoutPrefix, next);
          index += 1;
        } else {
          assignFlag(flags, withoutPrefix, "");
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
  "provider",
  "model",
  "effort",
  "timeout",
  "timeout-ms",
  "retries",
  "rpm",
  "concurrency",
  "token-budget",
  "excerpt-budget",
  "privacy-mode",
  "profile",
  "patch",
  "branch",
  "base",
  "head",
  "mode",
  "title",
  "target",
  "verification",
  "verification-command",
  "allow-files",
  "commit-message",
  "status",
  "run",
  "priority",
  "category",
  "risk",
  "source",
  "feature",
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
  "update-channel",
  "lock-timeout-ms",
  "stale-lock-ms",
  "keep-runs",
  "keep-days",
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
  const flags: Record<string, string | string[] | boolean> = {};

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
        assignFlag(flags, key, value);
        continue;
      }

      const next = rest[index + 1];
      if (next && !next.startsWith("-")) {
        assignFlag(flags, withoutPrefix, next);
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

function assignFlag(
  flags: Record<string, string | string[] | boolean>,
  key: string,
  value: string,
): void {
  const existing = flags[key];
  if (typeof existing === "string") {
    flags[key] = [existing, value];
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  flags[key] = value;
}

export function flagString(
  flags: Record<string, string | string[] | boolean>,
  key: string,
): string | undefined {
  const value = flags[key];
  if (Array.isArray(value)) {
    return value.at(-1);
  }
  return typeof value === "string" ? value : undefined;
}

export function flagStrings(
  flags: Record<string, string | string[] | boolean>,
  key: string,
): string[] {
  const value = flags[key];
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

export function flagBoolean(
  flags: Record<string, string | string[] | boolean>,
  key: string,
): boolean {
  return flags[key] === true;
}
