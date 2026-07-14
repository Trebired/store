import type { StoreResult } from "#y31thwq3bdf0";
import { fail } from "#44o0z05ifdgn";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const PLACEHOLDER = /\$(\d+)/gu;

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }

  return `"${value.replace(/"/gu, "\"\"")}"`;
}

function validateSqlIdentifier(value: string): StoreResult<true> | null {
  if (!IDENTIFIER.test(value)) {
    return fail("store-sql-identifier", "Invalid SQL identifier.", {
      field: value,
    });
  }

  return null;
}

function validatePlaceholderOrder(sql: string, params: unknown[]): StoreResult<true> | null {
  const placeholders = [...sql.matchAll(PLACEHOLDER)].map((match) => Number(match[1]));
  const expected = [...new Set(placeholders)].sort((a, b) => a - b);

  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== index + 1) {
      return fail("store-sql-placeholder", "SQL placeholders must be contiguous and 1-based.");
    }
  }

  if (expected.length !== params.length) {
    return fail("store-sql-placeholder", "SQL placeholder count does not match parameter count.");
  }

  return null;
}

export {
  quoteIdentifier,
  validatePlaceholderOrder,
  validateSqlIdentifier,
};
