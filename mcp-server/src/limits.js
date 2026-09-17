function boundedInteger(env, name, fallback, min, max) {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function limitsFromEnv(env = process.env) {
  return Object.freeze({
    ratePerMinute: boundedInteger(env, "MCP_RATE_LIMIT_PER_MINUTE", 30, 1, 120),
    maxConcurrency: boundedInteger(env, "MCP_MAX_CONCURRENCY", 2, 1, 8),
    timeoutMs: boundedInteger(env, "MCP_QUERY_TIMEOUT_MS", 2000, 250, 10000),
    maxFiles: boundedInteger(env, "MCP_MAX_FILES_PER_QUERY", 200, 1, 1000),
    maxRecords: boundedInteger(env, "MCP_MAX_RECORDS_SCANNED", 50000, 10, 200000),
    maxBytes: boundedInteger(env, "MCP_MAX_BYTES_PER_QUERY", 20 * 1024 * 1024, 1024, 100 * 1024 * 1024),
    maxFileBytes: boundedInteger(env, "MCP_MAX_FILE_BYTES", 5 * 1024 * 1024, 1024, 25 * 1024 * 1024),
    maxResultRows: boundedInteger(env, "MCP_MAX_RESULT_ROWS", 50, 1, 100),
  });
}

export class AdmissionControl {
  constructor(limits) {
    this.limits = limits;
    this.active = 0;
    this.windowStartedAt = Date.now();
    this.calls = 0;
  }

  enter() {
    const now = Date.now();
    if (now - this.windowStartedAt >= 60_000) { this.windowStartedAt = now; this.calls = 0; }
    if (this.calls >= this.limits.ratePerMinute) throw new Error("请求频率达到上限，请稍后重试");
    if (this.active >= this.limits.maxConcurrency) throw new Error("并发查询达到上限，请稍后重试");
    this.calls += 1;
    this.active += 1;
    let left = false;
    return () => { if (!left) { left = true; this.active -= 1; } };
  }
}
