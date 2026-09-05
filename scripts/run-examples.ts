import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
import { executeMutation } from "../src/execute-mutation.js";
import { validateState } from "../src/validate-state.js";

const root = fileURLToPath(new URL("../examples/", import.meta.url));
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = join(root, entry.name);
  const before: unknown = JSON.parse(await readFile(join(directory, "before.json"), "utf8"));
  const expected: unknown = JSON.parse(await readFile(join(directory, "after.json"), "utf8"));
  const code = await readFile(join(directory, "mutation.js"), "utf8");
  validateState(before);
  validateState(expected);
  const original = structuredClone(before);
  const result = await executeMutation(before, code);
  if (!result.applied) throw new Error(result.error);
  assert.deepEqual(result.state, expected);
  assert.deepEqual(before, original, "Original state must remain unchanged");
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  console.log(`${entry.name}: verified | JSON bytes ${bytes(before)} -> ${bytes(expected)}`);
}
