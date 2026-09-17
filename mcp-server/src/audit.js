import { appendFile, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export class AuditLog {
  constructor({ directory, hmacKey }) {
    this.directory = path.resolve(directory);
    this.hmacKey = hmacKey;
  }

  fingerprint(value) {
    return crypto.createHmac("sha256", this.hmacKey).update(JSON.stringify(value)).digest("hex");
  }

  async ensureWritable() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const probe = path.join(this.directory, ".write-probe");
    const handle = await open(probe, "a", 0o600);
    await handle.close();
    await unlink(probe);
  }

  async write(event) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    });
    await appendFile(path.join(this.directory, `mcp-audit-${dayStamp()}.jsonl`), `${line}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "a",
    });
  }
}
