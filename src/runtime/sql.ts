type RuntimeMetricOptions = {
  name?: string;
  operation?: string;
};

function createRuntimeMetricEvent(
  elapsedMs: number,
  options: RuntimeMetricOptions | undefined,
  success: boolean,
  rowCount: number,
) {
  return {
    elapsedMs,
    name: options?.name,
    operation: options?.operation,
    rowCount,
    success,
  };
}

function runtimeQueryErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("empty")) return "query-empty";
  if (message.includes("multiple")) return "query-multi-statement";
  if (message.includes("comment")) return "query-comments-forbidden";
  if (message.includes("placeholder")) return "query-placeholder-mismatch";
  if (message.includes("literal")) return "query-literal-forbidden";
  return "query-failed";
}

function summarizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim().slice(0, 240);
}

function sqlStatementKind(sql: string): string {
  return sql.trim().split(/\s+/u)[0]?.toLowerCase() || "";
}

function hashText(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash<<5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export {
  createRuntimeMetricEvent,
  hashText,
  runtimeQueryErrorCode,
  sqlStatementKind,
  summarizeSql,
};
