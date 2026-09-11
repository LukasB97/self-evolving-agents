import type { State } from "./state.js";

function fail(message: string): never {
  throw new Error(message);
}

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected an object");
}

function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("Unexpected object field");
}

function string(value: unknown, nonempty = false): asserts value is string {
  if (typeof value !== "string" || (nonempty && !value.length)) fail("Expected a string");
}

/** Reject values JSON would silently drop or change; bound nesting before schema traversal. */
export function assertJson(value: unknown, depth = 0, ancestors = new Set<object>()): void {
  if (depth > 100) fail("JSON nesting exceeds 100 levels");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object") fail("Expected finite JSON data");
  if (ancestors.has(value)) fail("Cyclic JSON data");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    fail("Expected a plain JSON object");
  }
  if (Object.getOwnPropertySymbols(value).length) fail("Symbol keys are not JSON data");
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertJson(value[index], depth + 1, ancestors);
  } else {
    for (const child of Object.values(value)) assertJson(child, depth + 1, ancestors);
  }
  ancestors.delete(value);
}

function content(part: unknown, allowObject: boolean): void {
  object(part);
  switch (part.type) {
    case "text":
      keys(part, ["type", "text"]);
      string(part.text);
      return;
    case "file":
      keys(part, ["type", "data", "mimeType"]);
      string(part.data);
      string(part.mimeType, true);
      return;
    case "object":
      if (!allowObject) fail("Object parts are only allowed in tool results");
      keys(part, ["type", "data"]);
      object(part.data);
      return;
    default:
      fail("Unknown content part");
  }
}

/**
 * Validate the canonical representation and consecutive tool roundtrips.
 * Only the in-flight mutation call may remain unanswered at the tail.
 */
export function validateState(value: unknown, pendingCallId?: string): asserts value is State {
  assertJson(value);
  if (!Array.isArray(value)) fail("State must be an array");
  const seen = new Set<string>();
  const pending = new Set<string>();
  for (const message of value) {
    object(message);
    keys(message, ["role", "parts"]);
    if (!Array.isArray(message.parts) || message.parts.length === 0) fail("Messages need at least one part");
    if (pending.size && message.role !== "tool") fail("Tool calls must receive results before another message");
    if (message.role === "user" || message.role === "model") {
      for (const part of message.parts) {
        object(part);
        if (part.type === "toolCall" && message.role === "model") {
          keys(part, ["type", "id", "tool", "args"]);
          string(part.id, true);
          string(part.tool, true);
          if (!("args" in part)) fail("Tool call needs args");
          object(part.args);
          if (seen.has(part.id)) fail("Duplicate tool call ID");
          seen.add(part.id);
          pending.add(part.id);
        } else {
          if (message.role === "model" && part.type === "file") fail("Model messages contain text or tool calls");
          content(part, false);
        }
      }
    } else if (message.role === "tool") {
      for (const part of message.parts) {
        object(part);
        keys(part, ["type", "callId", "content"]);
        if (part.type !== "toolResult") fail("Tool messages contain tool results");
        string(part.callId, true);
        if (!pending.delete(part.callId)) fail("Orphan or duplicate tool result");
        if (!Array.isArray(part.content) || !part.content.length) fail("Tool result needs content");
        for (const child of part.content) content(child, true);
      }
    } else fail("Unknown message role");
  }
  if (pending.size && !(pending.size === 1 && pendingCallId && pending.has(pendingCallId))) {
    fail("Unanswered tool call");
  }
}
