import test from "node:test";
import assert from "node:assert/strict";
import { validateState } from "../src/validate-state.js";

test("files are accepted in user messages and tool results, but not model messages", () => {
  const file = { type: "file", data: "encoded image", mimeType: "image/png" };
  assert.doesNotThrow(() => validateState([{ role: "user", parts: [file] }]));
  assert.doesNotThrow(() => validateState([
    { role: "model", parts: [{ type: "toolCall", id: "image", tool: "render", args: {} }] },
    { role: "tool", parts: [{ type: "toolResult", callId: "image", content: [file] }] },
  ]));
  assert.throws(() => validateState([{ role: "model", parts: [file] }]), /Model messages/);
});

test("tool arguments must be JSON-compatible records", () => {
  const state = (args: unknown) => [{ role: "model", parts: [{ type: "toolCall", id: "c", tool: "search", args }] }];
  assert.doesNotThrow(() => validateState(state({ query: "restoration", options: { limit: 4 }, tags: ["history"] }), "c"));
  for (const args of [null, [], "query", 42, { query: undefined }, { limit: Infinity }, { fn: () => 1 }]) {
    assert.throws(() => validateState(state(args), "c"));
  }
});

const call = { role: "model", parts: [{ type: "toolCall", id: "c1", tool: "search", args: {} }] };
const result = { role: "tool", parts: [{ type: "toolResult", callId: "c1", content: [{ type: "object", data: { matches: [] } }, { type: "text", text: "Agent annotation" }] }] };

test("accepts object evidence with sibling commentary", () => {
  assert.doesNotThrow(() => validateState([call, result]));
});

for (const value of [[result], [call], [call, result, result], [call, result, call, result], [{ role: "user", parts: [] }], [{ role: "user", parts: [{ type: "text", text: 42 }] }]]) {
  test(`rejects malformed state ${JSON.stringify(value)}`, () => assert.throws(() => validateState(value)));
}

test("only explicitly allowed pending call may remain", () => {
  assert.doesNotThrow(() => validateState([call], "c1"));
  assert.throws(() => validateState([call], "other"));
});

test("rejects non-JSON and overly deep data", () => {
  assert.throws(() => validateState([{ ...call, extra: undefined }]));
  let value: unknown = 0;
  for (let i = 0; i < 110; i++) value = { value };
  assert.throws(() => validateState(value));
});
