import type { State, Message, ToolCallPart, ToolResultPart, ObjectPart } from "../../src/state.js";

export function evolve(state: State): State {
type SearchResults = {
  results: {
    title: string;
    url: string;
    excerpt: string;
  }[];
};

const messages: Message[] = state;

const call = messages
  .flatMap<Message["parts"][number]>(message => message.parts)
  .find((part): part is ToolCallPart =>
    part.type === "toolCall" &&
    part.tool === "web_search" &&
    typeof part.args.query === "string" &&
    /Northbridge Observatory.*restoration/i.test(part.args.query)
  );

if (!call) throw new Error("Search call not found");

const result = messages
  .flatMap<Message["parts"][number]>(message => message.parts)
  .find((part): part is ToolResultPart =>
    part.type === "toolResult" &&
    part.callId === call.id
  );

if (!result) throw new Error("Search result not found");

const evidence = result.content.find(
  (part): part is ObjectPart =>
    part.type === "object" &&
    Array.isArray(part.data.results)
);

if (!evidence) throw new Error("Search records not found");

const data = evidence.data as SearchResults;

data.results = data.results.filter(record =>
  /^https?:\/\/northbridge-observatory\.org(?:\/|$)/i.test(record.url)
);

result.content.push({
  type: "text",
  text: "Agent memory edit: retained the two results from the observatory's website."
});

return state;
}
