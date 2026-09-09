import type { State, ToolCallPart } from "./state.js";
import type { MutationOptions } from "./execute-mutation.js";
import { executeMutation } from "./execute-mutation.js";
import { validateState } from "./validate-state.js";

/** A mutation is a serial boundary, after all ordinary tool calls have completed. */
export async function applyMemoryMutation(state: State, options: MutationOptions = {}): Promise<{
  state: State;
  result: { applied: true } | { applied: false; error: string };
}> {
  const snapshot = structuredClone(state);
  const last = snapshot.at(-1);
  const part = last?.parts[0];
  if (last?.role !== "model" || last.parts.length !== 1 || part?.type !== "toolCall" || part.tool !== "evolve") {
    throw new Error("Mutation boundary requires a standalone evolve call last");
  }
  const call = part as ToolCallPart;
  validateState(snapshot, call.id);
  const args = call.args;
  let execution = args && typeof args === "object" && !Array.isArray(args) && typeof args.code === "string" && Object.keys(args).length === 1
    ? await executeMutation(snapshot, args.code, { ...options, pendingCallId: call.id })
    : { applied: false as const, error: "Expected exactly one code string" };
  if (execution.applied && JSON.stringify(execution.state.at(-1)) !== JSON.stringify(last)) {
    execution = { applied: false, error: "The final mutation call must be preserved exactly" };
  }
  const next = execution.applied ? execution.state : snapshot;
  const result: { applied: true } | { applied: false; error: string } = execution.applied
    ? { applied: true } : { applied: false, error: execution.error };
  next.push({ role: "tool", parts: [{ type: "toolResult", callId: call.id, content: [{ type: "object", data: result }] }] });
  validateState(next);
  return { state: next, result };
}
