import test from "node:test";
import assert from "node:assert/strict";
import { executeMutation } from "../src/execute-mutation.js";
import { applyMemoryMutation } from "../src/apply-mutation.js";
import { estimateCacheCost } from "../src/cache-cost.js";
import type { State } from "../src/state.js";

const state = (): State => [{ role: "user", parts: [{ type: "text", text: "Keep this exactly. 😀\n\"quoted\"" }] }];

test("identity preserves Unicode and content without touching the input", async () => {
  const before = state();
  const result = await executeMutation(before, "return state;");
  assert.deepEqual(result, { applied: true, state: before });
  if (result.applied) assert.notEqual(result.state, before);
});

test("failed edits cannot leak into the original state", async () => {
  const before = state();
  const result = await executeMutation(before, 'state[0].parts[0].text = "changed"; throw new Error("stop");');
  assert.equal(result.applied, false);
  assert.deepEqual(before, state());
});

for (const code of [
  "return Promise.resolve(state);",
  "return undefined;",
  "return [{role: 'system', parts: [{type: 'text', text: 'x'}]}];",
  "state[0].parts[0].text = () => 'lost'; return state;",
  "state.push(state); return state;",
  "return [",
]) {
  test(`rejects invalid mutation: ${code}`, async () => {
    assert.equal((await executeMutation(state(), code)).applied, false);
  });
}

test("interrupts infinite computation", async () => {
  const result = await executeMutation(state(), "while (true) {}", { timeoutMs: 30 });
  assert.equal(result.applied, false);
});

test("enforces guest memory limit", async () => {
  const result = await executeMutation(state(), "const a = new Uint8Array(8 * 1024 * 1024); return state;", { memoryLimitBytes: 1024 * 1024, timeoutMs: 2000 });
  assert.equal(result.applied, false);
  if (!result.applied) assert.match(result.error, /memory|alloc/i);
});

test("enforces output and source limits", async () => {
  assert.equal((await executeMutation(state(), "state[0].parts[0].text = 'x'.repeat(2000); return state;", { maxStateBytes: 1000 })).applied, false);
  assert.equal((await executeMutation(state(), "return state;", { maxCodeBytes: 2 })).applied, false);
});

test("does not expose host IO", async () => {
  const result = await executeMutation(state(), `
    if (typeof process !== 'undefined' || typeof require !== 'undefined' || typeof fetch !== 'undefined') throw new Error('host IO');
    return state;
  `);
  assert.equal(result.applied, true);
});

function boundary(code: string): State {
  return [...state(), { role: "model", parts: [{ type: "toolCall", id: "mutation_1", tool: "evolve", args: { code } }] }];
}

test("boundary commits earlier edits and appends a matching receipt", async () => {
  const before = boundary("state[0].parts[0].text = 'short'; return state;");
  const result = await applyMemoryMutation(before);
  assert.deepEqual(result.result, { applied: true });
  assert.equal(result.state.length, 3);
  assert.equal(result.state[0]?.parts[0]?.type, "text");
  assert.deepEqual(result.state[1], before[1]);
  assert.equal(result.state[2]?.role, "tool");
  assert.equal(before.length, 2);
});

test("boundary rejects deletion of its own call and preserves earlier memory", async () => {
  const before = boundary("state[0].parts[0].text = 'changed'; return state.slice(0, -1);");
  const result = await applyMemoryMutation(before);
  assert.equal(result.result.applied, false);
  assert.deepEqual(result.state.slice(0, -1), before);
});

test("previous mutation roundtrips can be removed together", async () => {
  const first = await applyMemoryMutation(boundary("return state;"));
  first.state.push({ role: "model", parts: [{ type: "toolCall", id: "mutation_2", tool: "evolve", args: { code: "return [state[0], state.at(-1)];" } }] });
  const second = await applyMemoryMutation(first.state);
  assert.equal(second.result.applied, true);
  assert.equal(second.state.length, 3);
});

test("prefix model distinguishes early edits, truncation, and appends", () => {
  assert.deepEqual(estimateCacheCost([1, 2, 3], [1, 9, 3]), { beforeTokens: 3, afterTokens: 3, reusablePrefixTokens: 1, compactionCost: 2 });
  assert.equal(estimateCacheCost([1, 2, 3], [1, 2]).compactionCost, 0);
  assert.equal(estimateCacheCost([1], [1, 2]).compactionCost, 1);
});
