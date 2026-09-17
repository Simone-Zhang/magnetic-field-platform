import { opendir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { assertAllowedField, containsPath, isSafeRelativePath, safeLabel, sanitizeRecord } from "./policy.js";

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export async function resolveDatasets(config, env = process.env) {
  const datasets = [];
  for (const entry of config.datasets) {
    const configuredRoot = env[entry.rootEnv] || entry.defaultRoot;
    const root = path.resolve(configuredRoot);
    let canonicalRoot = root;
    let available = true;
    try {
      canonicalRoot = await realpath(root);
      const rootStat = await stat(canonicalRoot);
      available = rootStat.isDirectory();
    } catch {
      available = false;
    }
    datasets.push({ ...entry, root, canonicalRoot, available });
  }
  return datasets;
}

async function enumerateFiles(dataset, limits, deadline) {
  if (!dataset.available) return [];
  const files = [];
  const queue = [{ absolute: dataset.canonicalRoot, relative: "", depth: 0 }];
  while (queue.length) {
    if (Date.now() > deadline) throw new Error("查询超时");
    const current = queue.shift();
    const dir = await opendir(current.absolute);
    for await (const entry of dir) {
      if (entry.name.startsWith(".") || !isSafeRelativePath(path.join(current.relative, entry.name))) continue;
      if (entry.isSymbolicLink()) continue;
      const relative = path.join(current.relative, entry.name);
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < 4) queue.push({ absolute, relative, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile() || !dataset.extensions.includes(path.extname(entry.name).toLowerCase())) continue;
      const canonical = await realpath(absolute);
      if (!containsPath(dataset.canonicalRoot, canonical)) continue;
      files.push({ absolute: canonical, relative: relative.split(path.sep).join("/") });
      if (files.length >= limits.maxFiles) return files;
    }
  }
  return files;
}

async function readBounded(file, limits, budget) {
  const info = await stat(file.absolute);
  if (!info.isFile() || info.size > limits.maxFileBytes) throw new Error("数据文件超出大小限制");
  if (budget.bytes + info.size > limits.maxBytes) throw new Error("查询读取量达到上限");
  const handle = await open(file.absolute, "r");
  try {
    const buffer = await handle.readFile();
    budget.bytes += buffer.byteLength;
    return { buffer, info };
  } finally {
    await handle.close();
  }
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index] ?? "\n";
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (!rows.length) return [];
  const headers = rows.shift().map((item) => item.trim());
  return rows.filter((items) => items.some((item) => item !== "")).map((items) => Object.fromEntries(headers.map((header, i) => [header, coerce(items[i] ?? "")])));
}

function coerce(value) {
  const trimmed = String(value).trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function flattenUnityExport(root, sourceFile) {
  const records = [];
  const common = {
    sourceFile,
    schemaVersion: root.schemaVersion,
    exportTime: root.exportTime,
    experimentMode: root.experimentMode,
    experimentType: root.experimentType,
  };
  for (const group of Array.isArray(root.groups) ? root.groups : []) {
    for (const point of Array.isArray(group.points) ? group.points : []) {
      records.push({ recordType: "measurement", ...common, groupIndex: group.groupIndex, groupMode: group.groupMode, groupCoilState: group.coilState, usedForCloud: group.usedForCloud, ...point });
    }
  }
  for (const point of Array.isArray(root.cloudPoints) ? root.cloudPoints : []) {
    records.push({ recordType: "cloudPoint", ...common, ...point });
  }
  for (const field of Array.isArray(root.cloudFields) ? root.cloudFields : []) {
    const fieldMode = field.fieldMode ?? field.mode ?? field.name;
    for (const point of Array.isArray(field.points) ? field.points : []) {
      records.push({ recordType: "cloudFieldPoint", ...common, fieldMode, ...point });
    }
  }
  return records;
}

function recordsFromJson(value, sourceFile) {
  if (value && typeof value === "object" && (Array.isArray(value.groups) || Array.isArray(value.cloudPoints) || Array.isArray(value.cloudFields))) {
    return flattenUnityExport(value, sourceFile);
  }
  if (Array.isArray(value)) return value.map((record) => ({ sourceFile, ...record }));
  for (const key of ["records", "data", "items"]) {
    if (Array.isArray(value?.[key])) return value[key].map((record) => ({ sourceFile, ...record }));
  }
  return value && typeof value === "object" ? [{ sourceFile, ...value }] : [];
}

async function loadRecordFile(file, dataset, limits, budget) {
  const { buffer } = await readBounded(file, limits, budget);
  try {
    const text = textDecoder.decode(buffer);
    const extension = path.extname(file.relative).toLowerCase();
    let records;
    if (extension === ".csv" || extension === ".tsv") records = parseDelimited(text, extension === ".csv" ? "," : "\t");
    else if (extension === ".jsonl") records = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    else records = recordsFromJson(JSON.parse(text), file.relative);
    return records.map((record) => sanitizeRecord(dataset, record));
  } catch {
    throw new Error("数据文件格式无效或不是 UTF-8");
  }
}

function compare(recordValue, operator, filterValue) {
  if (operator === "contains") return typeof recordValue === "string" && recordValue.toLocaleLowerCase().includes(String(filterValue).toLocaleLowerCase());
  if (operator === "eq") return recordValue === filterValue;
  if (operator === "ne") return recordValue !== filterValue;
  if (typeof recordValue !== "number" || typeof filterValue !== "number") return false;
  if (operator === "gt") return recordValue > filterValue;
  if (operator === "gte") return recordValue >= filterValue;
  if (operator === "lt") return recordValue < filterValue;
  if (operator === "lte") return recordValue <= filterValue;
  return false;
}

function applyFilters(dataset, record, filters = []) {
  return filters.every((filter) => {
    assertAllowedField(dataset, filter.field);
    return compare(record[filter.field], filter.op, filter.value);
  });
}

export async function listDatasetFiles(dataset, limits, deadline) {
  const files = await enumerateFiles(dataset, limits, deadline);
  return { files, truncated: files.length >= limits.maxFiles };
}

export async function queryDataset(dataset, query, limits) {
  if (dataset.kind !== "records") throw new Error("该数据集不支持记录查询");
  const deadline = Date.now() + limits.timeoutMs;
  const { files, truncated: filesTruncated } = await listDatasetFiles(dataset, limits, deadline);
  const budget = { bytes: 0, scanned: 0 };
  const matches = [];
  const offset = query.offset ?? 0;
  const limit = Math.min(query.limit ?? 20, limits.maxResultRows);
  const select = query.select?.length ? query.select : dataset.allowedFields;
  for (const field of select) assertAllowedField(dataset, field);
  outer: for (const file of files) {
    if (Date.now() > deadline) throw new Error("查询超时");
    const records = await loadRecordFile(file, dataset, limits, budget);
    for (const record of records) {
      budget.scanned += 1;
      if (budget.scanned > limits.maxRecords) throw new Error("扫描记录数达到上限");
      if (!applyFilters(dataset, record, query.filters)) continue;
      if (matches.length >= offset) matches.push(Object.fromEntries(select.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]])));
      else matches.push(null);
      if (matches.length >= offset + limit) break outer;
    }
  }
  const rows = matches.slice(offset).filter(Boolean);
  return { rows, returned: rows.length, scanned: budget.scanned, bytesRead: budget.bytes, filesScanned: files.length, truncated: filesTruncated || rows.length === limit };
}

export async function aggregateDataset(dataset, query, limits) {
  const deadline = Date.now() + limits.timeoutMs;
  const { files, truncated } = await listDatasetFiles(dataset, limits, deadline);
  const budget = { bytes: 0, scanned: 0 };
  assertAllowedField(dataset, query.field);
  if (query.groupBy) assertAllowedField(dataset, query.groupBy);
  const groups = new Map();
  for (const file of files) {
    const records = await loadRecordFile(file, dataset, limits, budget);
    for (const record of records) {
      if (Date.now() > deadline) throw new Error("查询超时");
      budget.scanned += 1;
      if (budget.scanned > limits.maxRecords) throw new Error("扫描记录数达到上限");
      if (!applyFilters(dataset, record, query.filters)) continue;
      const value = record[query.field];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const key = query.groupBy ? String(record[query.groupBy] ?? "(missing)").slice(0, 128) : "all";
      const item = groups.get(key) ?? { group: key, count: 0, sum: 0, min: value, max: value };
      item.count += 1; item.sum += value; item.min = Math.min(item.min, value); item.max = Math.max(item.max, value);
      groups.set(key, item);
      if (groups.size > 100) throw new Error("分组数量达到上限");
    }
  }
  const rows = [...groups.values()].map(({ sum, ...item }) => ({ ...item, avg: item.count ? sum / item.count : null })).sort((a, b) => a.group.localeCompare(b.group)).slice(0, limits.maxResultRows);
  return { rows, scanned: budget.scanned, bytesRead: budget.bytes, filesScanned: files.length, truncated };
}

export async function listArtifacts(dataset, limits) {
  if (dataset.kind !== "artifacts") throw new Error("该数据集不是制品清单");
  const deadline = Date.now() + limits.timeoutMs;
  const { files, truncated } = await listDatasetFiles(dataset, limits, deadline);
  const rows = [];
  let bytesRead = 0;
  for (const file of files.slice(0, limits.maxResultRows)) {
    const info = await stat(file.absolute);
    if (info.size > limits.maxFileBytes || bytesRead + info.size > limits.maxBytes) continue;
    const handle = await open(file.absolute, "r");
    try {
      const hash = crypto.createHash("sha256");
      hash.update(await handle.readFile());
      bytesRead += info.size;
      rows.push({ name: safeLabel(file.relative), sizeBytes: info.size, modifiedAt: info.mtime.toISOString(), sha256: hash.digest("hex") });
    } finally {
      await handle.close();
    }
  }
  return { rows, returned: rows.length, bytesRead, truncated: truncated || files.length > rows.length };
}
