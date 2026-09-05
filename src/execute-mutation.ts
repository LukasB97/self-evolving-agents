import { getQuickJS } from "quickjs-emscripten";
import type { State } from "./state.js";
import { validateState } from "./validate-state.js";

export type MutationOptions = {
  timeoutMs?: number;
  memoryLimitBytes?: number;
  maxStateBytes?: number;
  maxCodeBytes?: number;
  pendingCallId?: string;
};

export type MutationExecution =
  | { applied: true; state: State }
  | { applied: false; error: string };

/** Execute a synchronous function body against a copy. Never mutate the caller's state. */
export async function executeMutation(
  state: State,
  code: string,
  options: MutationOptions = {},
): Promise<MutationExecution> {
  try {
    const timeoutMs = options.timeoutMs ?? 250;
    const memoryLimitBytes = options.memoryLimitBytes ?? 16 * 1024 * 1024;
    const maxStateBytes = options.maxStateBytes ?? 1024 * 1024;
    const maxCodeBytes = options.maxCodeBytes ?? 64 * 1024;
    for (const limit of [timeoutMs, memoryLimitBytes, maxStateBytes, maxCodeBytes]) {
      if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Limits must be positive integers");
    }
    validateState(state, options.pendingCallId);
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized) > maxStateBytes) throw new Error("Input state exceeds byte limit");
    if (typeof code !== "string" || Buffer.byteLength(code) > maxCodeBytes) throw new Error("Code exceeds byte limit or is not text");
    const QuickJS = await getQuickJS();
    const runtime = QuickJS.newRuntime();
    try {
      runtime.setMemoryLimit(memoryLimitBytes);
      runtime.setMaxStackSize(256 * 1024);
      const deadline = Date.now() + timeoutMs;
      runtime.setInterruptHandler(() => Date.now() >= deadline);
      const vm = runtime.newContext();
      try {
        // Both state and code cross as data. Generated code is never evaluated by Node.
        const input = vm.newString(serialized);
        const body = vm.newString(code);
        vm.setProp(vm.global, "__stateJSON", input);
        vm.setProp(vm.global, "__mutationCode", body);
        input.dispose();
        body.dispose();
        const result = vm.evalCode(`(() => {
          const stringify = JSON.stringify;
          const isArray = Array.isArray;
          const isFinite = Number.isFinite;
          const input = JSON.parse(__stateJSON);
          const compact = new Function("state", '"use strict";\\n' + __mutationCode);
          const output = compact(input);
          if (!isArray(output)) throw new Error("Mutation must synchronously return a State array");
          return stringify(output, (_key, value) => {
            const type = typeof value;
            if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
              throw new Error("Mutation returned non-JSON data");
            }
            if (type === "number" && !isFinite(value)) throw new Error("Mutation returned a non-finite number");
            return value;
          });
        })()`);
        if (result.error) {
          const error = vm.dump(result.error) as { message?: string } | null;
          result.error.dispose();
          throw new Error(error?.message ?? "QuickJS execution failed");
        }
        let output: string;
        try {
          output = vm.getString(result.value);
        } finally {
          result.value.dispose();
        }
        if (Buffer.byteLength(output) > maxStateBytes) throw new Error("Output state exceeds byte limit");
        const candidate: unknown = JSON.parse(output);
        validateState(candidate, options.pendingCallId);
        return { applied: true, state: candidate };
      } finally {
        vm.dispose();
      }
    } finally {
      runtime.dispose();
    }
  } catch (error) {
    return { applied: false, error: error instanceof Error ? error.message : "Mutation failed" };
  }
}
