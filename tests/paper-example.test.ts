import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evolve } from "../examples/04-web-search/mutation.js";
import { validateState } from "../src/validate-state.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
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
