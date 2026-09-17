import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AuditLog } from "./audit.js";
import { aggregateDataset, listArtifacts, listDatasetFiles, queryDataset, resolveDatasets } from "./data.js";
import { AdmissionControl, limitsFromEnv } from "./limits.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(moduleDirectory, "..");
const config = JSON.parse(await readFile(path.join(appDirectory, "config", "datasets.json"), "utf8"));
const limits = limitsFromEnv();
const datasets = await resolveDatasets(config);
const datasetMap = new Map(datasets.map((dataset) => [dataset.id, dataset]));
const auditKey = process.env.MCP_AUDIT_HMAC_KEY;
if (!auditKey || auditKey.length < 32) throw new Error("MCP_AUDIT_HMAC_KEY 必须通过环境变量提供，且至少 32 个字符");
const audit = new AuditLog({ directory: process.env.MCP_AUDIT_DIR || path.join(appDirectory, "var", "audit"), hmacKey: auditKey });
await audit.ensureWritable();
const admission = new AdmissionControl(limits);

const filterSchema = z.object({
  field: z.string().min(1).max(64),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "contains"]),
  value: z.union([z.string().max(128), z.number().finite(), z.boolean()]),
});
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const recordSchema = z.record(z.string(), scalarSchema);

function getDataset(id) {
  const dataset = datasetMap.get(id);
  if (!dataset) throw new Error("未知数据集");
  if (!dataset.available) throw new Error("数据集目录不可用；请由管理员检查只读挂载或环境变量");
  return dataset;
}

function toolResult(data, summary) {
  return { structuredContent: data, content: [{ type: "text", text: summary }] };
}

async function audited(tool, args, operation) {
  const leave = admission.enter();
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const base = { requestId, tool, dataset: args.dataset ?? null, queryFingerprint: audit.fingerprint(args) };
  try {
    await audit.write({ ...base, event: "started" });
    const result = await operation();
    await audit.write({ ...base, event: "completed", outcome: "ok", durationMs: Date.now() - started, returned: result.returned ?? result.rows?.length ?? null, scanned: result.scanned ?? null, bytesRead: result.bytesRead ?? null });
    return result;
  } catch (error) {
    await audit.write({ ...base, event: "completed", outcome: "error", durationMs: Date.now() - started, errorClass: error?.constructor?.name ?? "Error" });
    throw error;
  } finally {
    leave();
  }
}

const server = new McpServer(
  { name: "magnetic-field-production-readonly", version: "1.0.0" },
  { instructions: "只查询经管理员批准、去标识化的实验快照。禁止尝试读取源码、密钥、个人信息或数据目录之外的路径。结果可能因硬限流而截断；需要更多数据时缩小过滤条件。" },
);

server.registerTool("list_datasets", {
  title: "列出批准的数据集",
  description: "查看可供只读查询的数据集、可用状态与字段白名单。不会读取业务记录。",
  inputSchema: {},
  outputSchema: {
    datasets: z.array(z.object({
      id: z.string(), title: z.string(), description: z.string(), kind: z.string(),
      allowedFields: z.array(z.string()), available: z.boolean(),
    })),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async () => {
  const result = await audited("list_datasets", {}, async () => ({ rows: datasets.map(({ id, title, description, kind, allowedFields, available }) => ({ id, title, description, kind, allowedFields, available })) }));
  return toolResult({ datasets: result.rows }, `共有 ${result.rows.length} 个受控数据集。`);
});

server.registerTool("describe_dataset", {
  title: "描述数据集",
  description: "返回数据集策略、字段白名单和受限文件数量；不返回文件名或记录正文。",
  inputSchema: { dataset: z.string().min(1).max(80) },
  outputSchema: {
    id: z.string(), title: z.string(), description: z.string(), kind: z.string(),
    allowedFields: z.array(z.string()), fileCount: z.number().int(), truncated: z.boolean(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ dataset: id }) => {
  const dataset = getDataset(id);
  const result = await audited("describe_dataset", { dataset: id }, async () => {
    const listing = await listDatasetFiles(dataset, limits, Date.now() + limits.timeoutMs);
    return { returned: listing.files.length, truncated: listing.truncated };
  });
  return toolResult({ id: dataset.id, title: dataset.title, description: dataset.description, kind: dataset.kind, allowedFields: dataset.allowedFields, fileCount: result.returned, truncated: result.truncated }, `数据集 ${dataset.id} 有 ${result.returned} 个可见文件。`);
});

server.registerTool("query_records", {
  title: "查询批准的实验记录",
  description: "在字段白名单内过滤并投影 JSON/JSONL/CSV/TSV 快照。无任意路径、SQL 或脚本执行能力。",
  inputSchema: {
    dataset: z.string().min(1).max(80),
    filters: z.array(filterSchema).max(8).default([]),
    select: z.array(z.string().min(1).max(64)).max(30).optional(),
    offset: z.number().int().min(0).max(500).default(0),
    limit: z.number().int().min(1).max(50).default(20),
  },
  outputSchema: {
    rows: z.array(recordSchema), returned: z.number().int(), scanned: z.number().int(),
    bytesRead: z.number().int(), filesScanned: z.number().int(), truncated: z.boolean(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async (args) => {
  const dataset = getDataset(args.dataset);
  const result = await audited("query_records", args, () => queryDataset(dataset, args, limits));
  return toolResult(result, `返回 ${result.returned} 条；扫描 ${result.scanned} 条、${result.filesScanned} 个文件。${result.truncated ? "结果已截断。" : ""}`);
});

server.registerTool("aggregate_records", {
  title: "聚合批准的实验记录",
  description: "对一个获批数值字段计算 count/min/max/avg，可按一个获批字段分组。",
  inputSchema: {
    dataset: z.string().min(1).max(80),
    field: z.string().min(1).max(64),
    groupBy: z.string().min(1).max(64).optional(),
    filters: z.array(filterSchema).max(8).default([]),
  },
  outputSchema: {
    rows: z.array(z.object({ group: z.string(), count: z.number().int(), min: z.number(), max: z.number(), avg: z.number().nullable() })),
    scanned: z.number().int(), bytesRead: z.number().int(), filesScanned: z.number().int(), truncated: z.boolean(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async (args) => {
  const dataset = getDataset(args.dataset);
  const result = await audited("aggregate_records", args, () => aggregateDataset(dataset, args, limits));
  return toolResult(result, `聚合得到 ${result.rows.length} 组；扫描 ${result.scanned} 条记录。${result.truncated ? "输入文件清单已截断。" : ""}`);
});

server.registerTool("list_report_artifacts", {
  title: "列出报告制品",
  description: "只返回批准报告的名称、大小、修改时间与 SHA-256，不读取或返回 PDF/PNG 正文。",
  inputSchema: { dataset: z.literal("platform_report_artifacts").default("platform_report_artifacts") },
  outputSchema: {
    rows: z.array(z.object({ name: z.string(), sizeBytes: z.number().int(), modifiedAt: z.string(), sha256: z.string() })),
    returned: z.number().int(), bytesRead: z.number().int(), truncated: z.boolean(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async (args) => {
  const dataset = getDataset(args.dataset);
  const result = await audited("list_report_artifacts", args, () => listArtifacts(dataset, limits));
  return toolResult(result, `返回 ${result.returned} 个报告制品。${result.truncated ? "清单已截断。" : ""}`);
});

await server.connect(new StdioServerTransport());
