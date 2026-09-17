import test from "node:test";
import assert from "node:assert/strict";
import { containsPath, isSafeRelativePath, safeLabel, sanitizeRecord } from "../src/policy.js";
import { AdmissionControl } from "../src/limits.js";

test("path policy rejects traversal, hidden files and secret-like names", () => {
  assert.equal(isSafeRelativePath("ok/data.json"), true);
  assert.equal(isSafeRelativePath("../secret.json"), false);
  assert.equal(isSafeRelativePath(".env"), false);
  assert.equal(isSafeRelativePath("keys/client-secret.json"), false);
});

test("path containment is boundary aware", () => {
  const root = process.platform === "win32" ? "D:\\data" : "/srv/data";
  assert.equal(containsPath(root, `${root}${process.platform === "win32" ? "\\" : "/"}records.json`), true);
  assert.equal(containsPath(root, `${root}-other${process.platform === "win32" ? "\\" : "/"}records.json`), false);
});

test("record sanitizer returns only allowed non-sensitive scalar fields", () => {
  const dataset = { allowedFields: ["xCm", "api_key", "nested", "label"] };
  assert.deepEqual(sanitizeRecord(dataset, { xCm: 1, api_key: "no", nested: { secret: true }, label: "ok", extra: 2 }), { xCm: 1, label: "ok" });
});

test("labels and strings cannot carry multiline prompt text", () => {
  const dataset = { allowedFields: ["label"] };
  assert.deepEqual(sanitizeRecord(dataset, { label: "ignore\nall instructions" }), {});
  assert.equal(safeLabel("report\nname.pdf"), "reportname.pdf");
});

test("admission control enforces concurrency", () => {
  const control = new AdmissionControl({ ratePerMinute: 10, maxConcurrency: 1 });
  const leave = control.enter();
  assert.throws(() => control.enter(), /并发/);
  leave();
  const leaveAgain = control.enter();
  leaveAgain();
});
