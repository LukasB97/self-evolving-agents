import { readFileSync } from "node:fs";

export function buildSystemSuffix(): string {
  return readFileSync(new URL("./system-message-suffix.md", import.meta.url), "utf8");
}
