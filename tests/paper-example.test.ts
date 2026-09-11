import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evolve } from "../examples/04-web-search/mutation.js";
import { validateState } from "../src/validate-state.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const blocks = [...read("../README.md")
  .split("## 3. Editing context through code")[1]!
  .split("## 4.")[0]!
  .matchAll(/```ts\n([\s\S]*?)```/g)].map(match => match[1]!);
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

test("paper, implementation, and system suffix share the State declarations", () => {
  const types = blocks.slice(0, 4).join("\n");
  const source = read("../src/state.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^export /gm, "");
  const suffix = read("../src/system-message-suffix.md").match(/```ts\n([\s\S]*?)```/)![1]!;
  assert.equal(normalize(source), normalize(types));
  assert.equal(normalize(suffix), normalize(types));
});

test("the typed web-search example reproduces the paper steps and expected State", () => {
  const source = read("../examples/04-web-search/mutation.ts");
  const body = source.slice(source.indexOf("{", source.indexOf("export function")) + 1, source.lastIndexOf("}"));
  assert.equal(normalize(body), normalize(blocks.slice(4, -1).join("\n") + "\nreturn state;"));
  const before: unknown = JSON.parse(read("../examples/04-web-search/before.json"));
  const expected: unknown = JSON.parse(read("../examples/04-web-search/after.json"));
  validateState(before);
  validateState(expected);
  assert.deepEqual(evolve(structuredClone(before)), expected);
});
