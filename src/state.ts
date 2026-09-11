/** State schema shared with Chapter 3. Runtime validation enforces JSON-compatible values. */
export type State = Message[];

export type Message =
  | UserMessage
  | AssistantMessage
  | ToolMessage;

export type TextPart = {
  type: "text";
  text: string;
};

export type FilePart = {
  type: "file";
  data: string;
  mimeType: string;
};

export type UserMessage = {
  role: "user";
  parts: (TextPart | FilePart)[];
};

export type ToolCallPart = {
  type: "toolCall";
  id: string;
  tool: string;
  args: Record<string, unknown>;
};

export type AssistantMessage = {
  role: "model";
  parts: (TextPart | ToolCallPart)[];
};

export type ObjectPart = {
  type: "object";
  data: Record<string, unknown>;
};

export type ToolResultPart = {
  type: "toolResult";
  callId: string;
  content: (TextPart | ObjectPart | FilePart)[];
};

export type ToolMessage = {
  role: "tool";
  parts: ToolResultPart[];
};
