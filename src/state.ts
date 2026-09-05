/** The JSON-compatible subset supported by this reference implementation. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type TextPart = { type: "text"; text: string };
export type ObjectPart = { type: "object"; data: Record<string, Json> };
export type FilePart = { type: "file"; data: string; mimeType: string };
export type ToolCallPart = {
  type: "toolCall";
  id: string;
  tool: string;
  args: Json;
};
export type ToolResultContentPart = TextPart | ObjectPart | FilePart;
export type ToolResultPart = {
  type: "toolResult";
  callId: string;
  content: ToolResultContentPart[];
};
export type Message =
  | { role: "user"; parts: (TextPart | FilePart)[] }
  | { role: "model"; parts: (TextPart | FilePart | ToolCallPart)[] }
  | { role: "tool"; parts: ToolResultPart[] };

/** Agent-owned working memory. The visible transcript is stored separately. */
export type State = Message[];
