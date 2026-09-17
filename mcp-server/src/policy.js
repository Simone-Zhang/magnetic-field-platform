import path from "node:path";

export const SENSITIVE_FIELD = /(?:^|[_-])(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|session|private[_-]?key|client[_-]?secret|email|phone|mobile|id[_-]?card|student[_-]?name|user[_-]?name)(?:$|[_-])/i;
export const SENSITIVE_FILE = /(?:^|[._-])(\.env|id_rsa|id_ed25519|credentials?|secrets?|tokens?|cookies?|private[_-]?keys?)(?:$|[._-])/i;

export function isSafeRelativePath(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath);
  const parts = normalized.split(path.sep);
  return !parts.some((part) => !part || part === ".." || part.startsWith(".") || SENSITIVE_FILE.test(part));
}

export function assertAllowedField(dataset, field) {
  if (!dataset.allowedFields.includes(field) || SENSITIVE_FIELD.test(field)) {
    throw new Error(`字段不在数据集白名单中: ${field}`);
  }
}

export function sanitizeRecord(dataset, value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const field of dataset.allowedFields) {
    if (SENSITIVE_FIELD.test(field) || !Object.hasOwn(value, field)) continue;
    const item = value[field];
    if (item === null || typeof item === "boolean" || typeof item === "number") result[field] = item;
    else if (typeof item === "string" && !/[\u0000-\u001f\u007f]/.test(item)) result[field] = item.slice(0, 128);
  }
  return result;
}

export function safeLabel(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 128);
}

export function containsPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
