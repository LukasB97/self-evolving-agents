import { readFileSync } from "node:fs";

/** One source of truth for the types and the declaration of agent-owned memory. */
export function buildSystemSuffix(): string {
  const types = readFileSync(new URL("./state.ts", import.meta.url), "utf8").replace(/^export /gm, "");
  const suffix = readFileSync(new URL("./system-message-suffix.md", import.meta.url), "utf8");
  return `Your memory has this structured representation:\n\n\`\`\`ts\n${types}\`\`\`\n\n${suffix}`;
}
