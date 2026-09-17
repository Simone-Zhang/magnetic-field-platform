import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ name: "mcp-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "src", "server.js")],
  cwd: root,
  stderr: "pipe",
  env: {
    ...process.env,
    MCP_AUDIT_HMAC_KEY: "test-only-audit-key-with-more-than-32-characters",
    MCP_AUDIT_DIR: path.join(root, "var", "test-audit"),
    MCP_UNITY_DATA_ROOT: path.join(root, "test", "fixtures", "unity"),
    MCP_PLATFORM_DATA_ROOT: path.join(root, "test", "fixtures", "empty"),
    MCP_PLATFORM_REPORTS_ROOT: path.join(root, "test", "fixtures", "empty"),
  },
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["aggregate_records", "describe_dataset", "list_datasets", "list_report_artifacts", "query_records"]);
  assert.equal(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true), true);

  const query = await client.callTool({
    name: "query_records",
    arguments: {
      dataset: "unity_experiment_exports",
      filters: [{ field: "xCm", op: "gte", value: 0 }],
      select: ["xCm", "BmT"],
      limit: 10,
    },
  });
  assert.equal(query.isError, undefined);
  assert.equal(query.structuredContent.returned, 2);
  assert.deepEqual(query.structuredContent.rows, [{ xCm: 0, BmT: 0.25 }, { xCm: 3, BmT: 0.5 }]);
  assert.equal(JSON.stringify(query).includes("must-never-appear"), false);

  const aggregate = await client.callTool({
    name: "aggregate_records",
    arguments: { dataset: "unity_experiment_exports", field: "BmT", groupBy: "experimentMode" },
  });
  assert.deepEqual(aggregate.structuredContent.rows, [{ group: "Single", count: 2, min: 0.25, max: 0.5, avg: 0.375 }]);
  process.stdout.write("MCP stdio smoke test passed.\n");
} finally {
  await client.close();
}
