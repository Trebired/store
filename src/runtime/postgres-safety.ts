import { validatePlaceholderOrder } from "#zeealawo10hg";
import type { RuntimePostgresQueryOptions } from "./types.js";

function validateRuntimePostgresQuery(
  sql: string,
  params: readonly unknown[] = [],
  options: RuntimePostgresQueryOptions = {},
): void {
  if (!sql.trim()) {
    throw new Error("Postgres query cannot be empty.");
  }
  if (hasSqlComment(sql)) {
    throw new Error("Postgres application queries cannot contain SQL comments.");
  }
  if (hasMultipleStatements(sql)) {
    throw new Error("Postgres application queries cannot contain multiple statements.");
  }
  const placeholder = validatePlaceholderOrder(sql, [...params]);
  if (placeholder) {
    throw new Error(placeholder.message);
  }
  if ((options.operation === "read" || options.operation === "write") && !options.allowLiterals && hasInlineStringLiteral(sql)) {
    throw new Error("Postgres read/write queries cannot contain inline string literals.");
  }
}

function redactDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "redacted";
    }
    if (url.username) {
      url.username = "redacted";
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:@/]+)(?::([^@/]+))?@/u, "://redacted:redacted@");
  }
}

function detectQueryCaller(): { file?: string; line?: number } {
  const stack = new Error().stack?.split("\n").slice(2) || [];
  const frame = stack.find((line) => !line.includes("/runtime/postgres"));
  const match = frame?.match(/(?:\()?(.*):(\d+):(\d+)\)?$/u);
  return {
    file: match?.[1],
    line: match?.[2] ? Number(match[2]) : undefined,
  };
}

function hasSqlComment(sql: string): boolean {
  return /--|\/\*/u.test(sql);
}

function hasMultipleStatements(sql: string): boolean {
  return sql.trim().replace(/;$/u, "").includes(";");
}

function hasInlineStringLiteral(sql: string): boolean {
  return /'([^']|'')*'/u.test(sql);
}

export {
  detectQueryCaller,
  redactDatabaseUrl,
  validateRuntimePostgresQuery,
};
