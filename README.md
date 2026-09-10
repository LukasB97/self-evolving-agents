# Self-Evolving Agents

**A compaction mechanism for agents that manage their own memory**

Lukas Brückner · Concept paper and reference implementation

## Abstract

Long-running agents must compact their context while preserving information needed for further work. We propose treating that context as editable working memory. The agent writes code that locates and transforms existing messages and their parts, preserving selected material exactly and generating only the edits and new content. Repeated compactions can develop a stable, revisable core of knowledge and working practices. We propose training these decisions through their effects on task performance and resource use, accounting for both generated code and prompt-cache reuse. A reference implementation demonstrates execution and validation; reliable model use and benefits across long tasks remain to be evaluated.

## 1. Long-running agents and compaction

As agents take on longer tasks, a single run can span hours or days. Throughout that run, user messages, model responses, tool calls, and tool results accumulate. We call this complete record the **history**, represented as a sequence of messages,

$$
H_t = (m_1, \ldots, m_t).
$$

At each invocation, the model receives a **context** $C_t$, also a sequence of messages, containing the information available for its next step. Early in a run, this context can include the entire history. As the run continues, the accumulated material can exceed the model’s context window.

**Compaction** transforms the current context into a smaller representation from which the agent can continue,

$$
C'_t = f_t(C_t).
$$

It can summarize earlier work, remove unnecessary material, and retain relevant details. The resulting context may therefore contain both original and rewritten messages. Its usefulness depends on preserving the information needed for subsequent work.

The compacted context becomes the basis for further model calls, leaving room for new information. The full history remains stored separately. Through repeated compactions, an agent can continue working beyond the amount of history that fits into a single context window.

Compaction determines what the agent carries forward into its next steps. A detail removed now may be needed later, while unnecessary material occupies space that could support new work. How should an agent decide what to preserve, what to rewrite, and what to remove?

A common approach replaces earlier context with a generated summary, sometimes retaining selected messages alongside it. We propose letting the agent express its compaction decisions as code that transforms the existing messages and their parts. Selected material can be preserved exactly, while the model generates only the transformation code and any new or rewritten content.

## 2. Context as editable working memory

We propose treating the agent’s context as working memory whose contents and organization it can change. During compaction, the agent decides which material to preserve, which passages to rewrite, and where information belongs in the context from which it will continue.

Consider an agent working on a mathematical problem. It explores several approaches and proves two results. As this work unfolds, the proofs appear among calculations, conjectures, and unsuccessful attempts.

The agent can bring the two results and their proofs together near the beginning of its context, following the problem statement. It can condense unsuccessful attempts into explanations of why they failed and retain the next approach to explore. The proofs themselves can be carried forward exactly.

![First compaction: scattered proofs become an organized foundation alongside failed approaches and the next direction.](assets/compaction-01.svg)

*Green blocks mark established knowledge. Block heights are schematic and do not represent token counts.*

The resulting context gives the agent an organized basis for further work. Established results are available together, reasons for abandoning earlier approaches remain accessible, and space is available for new exploration.

As the agent continues, new work is appended to this context. It proves a third result and finds a generalization of the first. At the next compaction, it can incorporate the generalization alongside the original result, place the third result with the existing proofs, and update the next step.

![Second compaction: further work extends and revises the foundation while retaining the proofs.](assets/compaction-02.svg)

Each compaction therefore edits a context that may already contain earlier edits. Material that remains useful can be preserved across these cycles, while new findings give the agent reasons to revise both its content and its organization. The context develops with the work.

Our proposed mechanism lets the agent express these changes as code operating on the existing context. The next chapter explains how the agent can locate and transform that material while retaining selected content directly.

## 3. Editing context through code

The agent harness stores context as structured messages, each containing one or more parts. We call this representation the **State**. The model receives a provider-specific representation of that context. Although it may not see the objects and fields stored by the harness, it can recognize the corresponding content and relationships.

Our proposal is to give the model the State format and let it write code that locates and edits the material it understands. The harness executes that code and uses the resulting State as the context for the next invocation.

To make this concrete, we first define the structure that the editing code will operate on, then work through a change to an existing State.

### Messages

State is an ordered sequence of messages. Each message belongs to one of three variants, distinguished by its `role`.

```ts
type State = Message[];

type Message =
  | UserMessage
  | AssistantMessage
  | ToolMessage;
```

### User messages

A user can provide text and files. We represent images and other file inputs as file parts containing the data and its media type.

```ts
type TextPart = {
  type: "text";
  text: string;
};

type FilePart = {
  type: "file";
  data: string;
  mimeType: string;
};

type UserMessage = {
  role: "user";
  parts: (TextPart | FilePart)[];
};
```

### Assistant messages

The model can produce text and call tools. A tool-call part records the tool's name and arguments, together with an identifier that connects the call to its result.

```ts
type ToolCallPart = {
  type: "toolCall";
  id: string;
  tool: string;
  args: Record<string, unknown>;
};

type AssistantMessage = {
  role: "model";
  parts: (TextPart | ToolCallPart)[];
};
```

### Tool messages

A tool returns its result through a tool message. Each result refers to the corresponding call through `callId`.

Results can contain text, structured objects, or files. We introduce an object part for structured data and allow each result to contain several content parts.

```ts
type ObjectPart = {
  type: "object";
  data: Record<string, unknown>;
};

type ToolResultPart = {
  type: "toolResult";
  callId: string;
  content: (TextPart | ObjectPart | FilePart)[];
};

type ToolMessage = {
  role: "tool";
  parts: ToolResultPart[];
};
```

This allows, for example, a tool result to hold structured search records alongside an explanatory text part.

### Working with an existing State

Given this structure, how would we edit an existing State? Suppose it contains a web search for *Northbridge Observatory restoration*, and we want to retain only the results from the observatory's own website.

For this example, the search tool returns four records in a `results` array. Two belong to the observatory's website. Each record contains a title, URL, and excerpt.

```ts
type SearchResults = {
  results: {
    title: string;
    url: string;
    excerpt: string;
  }[];
};

const messages: Message[] = state;
```

The `results` field belongs to this particular tool's output format. State provides the surrounding message and part structure.

### Find the search call

We locate the earlier search by matching its query text.

```ts
const call = messages
  .flatMap(message => message.parts)
  .find((part): part is ToolCallPart =>
    part.type === "toolCall" &&
    part.tool === "web_search" &&
    typeof part.args.query === "string" &&
    /Northbridge Observatory.*restoration/i.test(part.args.query)
  );

if (!call) throw new Error("Search call not found");
```

### Find the search result

We read the identifier from that call and use it to locate the corresponding result.

```ts
const result = messages
  .flatMap(message => message.parts)
  .find((part): part is ToolResultPart =>
    part.type === "toolResult" &&
    part.callId === call.id
  );

if (!result) throw new Error("Search result not found");
```

### Keep the relevant records

We locate the object containing the search records, then use the tool's known output format to filter them by URL.

```ts
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
```

The retained records keep their original titles, URLs, and excerpts.

### Explain the edit

We add a separate text part alongside the structured data. This explains the selection while preserving the search result's JSON schema.

```ts
result.content.push({
  type: "text",
  text: "Agent memory edit: retained the two results from the observatory's website."
});
```

The edit uses the query text to find the search, the call relationship to find its result, and the URLs to select records. Array positions and call identifiers are resolved from the existing State.

### Letting the agent write the transformation

These steps can form the body of a function that receives State and returns the edited State.

```ts
function evolve(state: State): State {
  // Locate the search, filter its results, and add the note.
  return state;
}
```

We propose letting the agent write this function body and submit it through the `evolve` tool. The harness supplies the current State, executes the code on a copy, and validates the result before adopting it. If execution or validation fails, the previous State remains in place.

The model can formulate these operations using content and relationships it recognizes in its context. It does not need to reconstruct the entire State or know stored positions and identifiers in advance. It generates the transformation code and any new text, while retained material comes directly from the existing State.

## 4. Compaction cost

Writing an edit generates output tokens. Continuing from the edited State also requires processing the resulting model input. **Prompt caching** can reuse computation for an unchanged beginning of that input. Under an exact-prefix cache, changing an early token prevents reuse of the cached prefix beyond that position, even when later content remains identical.

The resulting input tokens outside the reusable prefix form the **Cache Cost**. To combine this with the cost of generating the `evolve` call, let `alpha` weight an output token relative to an uncached input token. For price-based weighting, `alpha` is the ratio of their respective token prices. **Compaction Cost** is then expressed in input-token equivalents.

```text
Cache Cost = resultingInputTokens - reusablePrefixTokens
Compaction Cost = alpha * evolveCallTokens + Cache Cost
```

The prefix must be measured over the complete serialized model input, including system instructions and tool definitions. An identical prefix is an opportunity for reuse; actual cache hits also depend on the provider's serialization and cache availability. Total task cost additionally includes cache reads, execution, and subsequent inference.

Preserving existing material saves the output tokens needed to reproduce it. Position also matters: a small edit near the end may cost less than an equally small edit near the beginning. This favors placing material expected to remain stable earlier in memory. A larger reorganization can still be worthwhile if it improves or reduces the cost of subsequent work.

## 5. Memory across repeated compactions

An agent continuing a task for hours or days can compact its memory many times. Each replacement becomes the basis for further work, whose results give the agent reasons to retain, refine, or correct that memory. Model weights remain fixed during this process.

The memory can also carry lessons about how to work. After unsuccessful proof attempts, the agent might retain a practice of searching for counterexamples earlier. If useful, that practice can continue to guide later attempts; contrary experience can prompt its revision.

Knowledge and working practices that remain useful across these cycles can form an increasingly stable, revisable core. This is the sense in which the agent is **self-evolving**: experience changes its persistent working memory, which in turn shapes its subsequent decisions.

## 6. Learning when and how to compact

The value of an edit depends on what happens afterward. Removing evidence may make the current input cheaper but prevent a later solution. Reorganizing a proof may cost tokens now and save substantial work later. Choosing edits therefore requires balancing task performance against costs across continued work.

We call the agent's strategy for choosing when to compact and what transformation to write its **compaction policy**. The `evolve` tool is available during the task; the application can also request a compaction as the context approaches its limit.

We propose training this policy with reinforcement learning using subsequent task outcomes and total resource use. Its actions are JavaScript transformations over State. Training can favor useful ways to select, organize, annotate, and revise memory, including frequent small edits, occasional larger reorganizations, or both. This trains the decisions that govern memory development; during an individual task, those decisions change State while model weights remain fixed.

## 7. Evaluation and related work

The research question is whether an agent can learn a sequence of compactions that improves task completion across long tasks at a worthwhile total cost. Execution alone establishes that edits can be applied. Evaluation must also test whether models reliably translate their understanding into edits of the intended State values and whether those edits help subsequent work.

Comparisons should use the same model, tasks, tools, context limit, and inference budget. Summary-based compaction should be allowed to organize knowledge and working practices. A comparison with fixed structured edit operations can test the contribution of JavaScript's expressiveness.

Tasks should make earlier evidence, corrections, and learned practices matter across several compactions. Measure task success, exact evidence and constraint preservation, repeated mistakes, tokens, latency, and actual cache use. Inspect whether retained lessons affect behavior and are corrected when experience contradicts them. Report training resources and cost weights separately. The [evaluation notes](docs/evaluation.md) describe the proposed experiments.

Existing approaches provide relevant comparisons. [Anthropic's compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) produces a continuation summary; [OpenAI's compaction](https://developers.openai.com/api/docs/guides/compaction) returns an opaque encrypted compaction item and may retain original items. [MemGPT](https://arxiv.org/abs/2310.08560) manages memory tiers, and [AgentFold](https://arxiv.org/abs/2510.24699) restructures context at different scales. Google's [AnchoredContextCompactor](https://adk.dev/api-reference/typescript/classes/AnchoredContextCompactor.html) maintains a working state at the start of context. [Context-Folding and FoldGRPO](https://arxiv.org/abs/2510.11967) and [FoldAct](https://arxiv.org/abs/2512.22733) study learning to manage context.

## 8. Reference implementation

The prototype executes model-written JavaScript in QuickJS with bounded resources and no external access. It validates State and tool-call relationships before accepting a replacement. The [integration boundary](src/apply-mutation.ts) handles successful and failed edits. The [design notes](docs/design.md) specify execution limits, provider requirements, and transcript storage. The [cache helper](src/cache-cost.ts) estimates the reusable prefix from supplied token sequences.

The agent must understand that its memory may contain edits from previous compactions. The [system suffix](src/system-message-suffix.md) communicates the distinction between working memory and transcript.

> What follows is your state.<br>
> You manage it yourself.<br>
> It is not the literal conversation the user sees.

Three hand-written examples demonstrate [shortening an explanation](examples/01-selective-compression/), [selecting exact evidence](examples/02-annotated-evidence/), and [consolidating a corrected task](examples/03-current-task/). There is no live provider adapter, reinforcement-learning training, or measured agent-performance result in this release. Provider integration must establish the required correspondence and supply token and cache measurements.

With Node.js 22 or later and pnpm 11.19.0, run:

```sh
pnpm install --frozen-lockfile
pnpm check
```

The checks cover types, execution and validation, failure isolation, prefix arithmetic, and reproduction of the examples.

---

By Lukas Brückner. Citation metadata is available in [CITATION.cff](CITATION.cff). The current rights notice is in [LICENSE](LICENSE).
