import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evolve as evolveOpenAI } from "./fixtures/openai-paper-example.js";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { evolve } from "../examples/04-web-search/mutation.js";
import { validateState } from "../src/validate-state.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const blocks = [...read("../README.md")
  .split("## 3. Editing context through code")[1]!
  .split("## 4.")[0]!
  .matchAll(/```ts\n([\s\S]*?)```/g)].map(match => match[1]!);
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

test("prototype implementation and system suffix share the State declarations", () => {
  const source = read("../src/state.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^export /gm, "");
  const suffix = read("../src/system-message-suffix.md").match(/```ts\n([\s\S]*?)```/)![1]!;
  assert.equal(normalize(source), normalize(suffix));
});

test("the prototype web-search example reproduces its expected State", () => {
  const before: unknown = JSON.parse(read("../examples/04-web-search/before.json"));
  const expected: unknown = JSON.parse(read("../examples/04-web-search/after.json"));
  validateState(before);
  validateState(expected);
  assert.deepEqual(evolve(structuredClone(before)), expected);
});


test("Chapter 3 matches the SDK-typechecked transformation", () => {
  const source = read("./fixtures/openai-paper-example.ts").replace("export function", "function");
  assert.equal(normalize(blocks.join("\n")), normalize(source));
});

// Reuse the synthetic search evidence, represented as Responses API input items.
function openAIState(): ResponseInputItem[] {
  const before: unknown = JSON.parse(read("../examples/04-web-search/before.json"));
  validateState(before);
  const items: ResponseInputItem[] = [];
  for (const message of before) {
    for (const part of message.parts) {
      if (part.type === "text") {
        items.push({ role: message.role === "model" ? "assistant" : "user", content: part.text });
      } else if (part.type === "toolCall") {
        items.push({ type: "function_call", name: part.tool, call_id: part.id, arguments: JSON.stringify(part.args) });
      } else if (part.type === "toolResult") {
        assert.equal(part.content.length, 1);
        const content = part.content[0]!;
        assert.equal(content.type, "object");
        if (content.type !== "object") throw new Error("Expected search data");
        items.push({ type: "function_call_output", call_id: part.callId, output: JSON.stringify(content.data) });
      } else {
        throw new Error("Unexpected fixture part");
      }
    }
  }
  items.push({ type: "reasoning", id: "rs_fixture", summary: [], encrypted_content: "opaque-fixture" });
  return items;
}

test("OpenAI paper edit preserves selected evidence and every unrelated item", () => {
  const before = openAIState();
  const expected = structuredClone(before);
  const result = expected.find(item => item.type === "function_call_output" && item.call_id === "restoration_search");
  assert.ok(result?.type === "function_call_output" && typeof result.output === "string");
  const data = JSON.parse(result.output);
  data.results = [data.results[0], data.results[2]];
  result.output = [
    { type: "input_text", text: JSON.stringify(data) },
    { type: "input_text", text: "Agent memory edit: retained the observatory's own results." }
  ];
  assert.deepEqual(evolveOpenAI(structuredClone(before)), expected);
  assert.deepEqual(before, openAIState());
});

test("OpenAI paper edit fails when its target call or string output is unavailable", () => {
  assert.throws(() => evolveOpenAI([]), /Search call not found/);
  const state = openAIState();
  const result = state.find(item => item.type === "function_call_output" && item.call_id === "restoration_search");
  assert.ok(result?.type === "function_call_output");
  result.output = [{ type: "input_text", text: "Already edited" }];
  assert.throws(() => evolveOpenAI(state), /Search result not found or not a string/);
});
