# Self-Evolving Agents

**A compaction mechanism for agents that manage their own memory**

Lukas Brückner · Concept paper and reference implementation

## Abstract

We propose a compaction mechanism in which an agent writes a function that transforms its current context. The function operates on the existing messages and their parts, allowing the agent to preserve content exactly, edit individual results, and reorganize larger sections. The agent decides when to compact and what to change, balancing the quality of the resulting context against the cost of generating edits and invalidating its prompt cache. We propose training these decisions with reinforcement learning through their effects on subsequent work. Across a long-running task, repeated compactions let the agent develop a lasting body of knowledge, working practices, and an emerging identity within its memory. This paper describes the mechanism, illustrates its use, and identifies what needs to be evaluated. The repository provides a reference implementation of the execution mechanism.

## 1. The compaction action is a function

An agent accumulates context as it works: user messages, its own reasoning and responses, tool calls, and tool results. Because its context window is finite, a long task eventually requires some of that material to be compacted. Compaction produces a smaller representation from which the agent can continue.

Current implementations take different forms. [Anthropic's compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) asks the model to produce a continuation summary and uses that summary to replace earlier content. [OpenAI's compaction](https://developers.openai.com/api/docs/guides/compaction) returns a context containing an opaque, encrypted compaction item and potentially retained original items. These mechanisms already carry useful state forward, and a summary can organize that state around the task.

The accumulated context records a history of states and interactions. This proposal reframes that context as **the agent's own working memory**, whose contents and organization it can change. Within this one memory, the beginning can hold long-term knowledge and working practices, the middle ongoing work, and the end short-term observations and exploration.

The agent therefore needs to understand that what it sees may already contain selected evidence, rewritten messages, or notes from earlier compactions. The actual conversation remains in an independently stored transcript. The [system suffix](src/system-message-suffix.md) establishes this relationship:

> What follows is your state.<br>
> You manage it yourself.<br>
> It is not the literal conversation the user sees.

The harness represents this memory as an array of messages, each containing typed parts. The reference implementation uses the following [types](src/state.ts):

```ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type TextPart = { type: "text"; text: string };
type ObjectPart = { type: "object"; data: Record<string, Json> };
type FilePart = { type: "file"; data: string; mimeType: string };
type ToolCallPart = {
  type: "toolCall";
  id: string;
  tool: string;
  args: Json;
};
type ToolResultContentPart = TextPart | ObjectPart | FilePart;
type ToolResultPart = {
  type: "toolResult";
  callId: string;
  content: ToolResultContentPart[];
};
type Message =
  | { role: "user"; parts: (TextPart | FilePart)[] }
  | { role: "model"; parts: (TextPart | FilePart | ToolCallPart)[] }
  | { role: "tool"; parts: ToolResultPart[] };
type State = Message[];
```

The provider renders this structured state into the context presented to the model. The model sees that rendering, rather than the State JSON itself. For the supported state, the required relationship is a **bijection**: a unique, reversible correspondence between the structured state and its model-visible representation, preserving both content and message-part structure.

Using the rendered context and the type definitions, the model can locate messages and parts by their contents and structure. Its function can use `find`, `filter`, regular expressions, tool-call relationships, and neighboring text as anchors, without knowing their array indices or first outputting a reconstructed JSON copy. Provider integrations must establish this correspondence and test whether the model can use it reliably; the [design notes](docs/design.md) discuss the integration requirements.

The compaction action can now be expressed as a function over this existing memory. The agent calls `evolve` with JavaScript executed as the body of:

```ts
function evolve(state: State): State
```

The harness runs the function on a copy of its actual current state, validates the returned state, and adopts it as the context for continued generation. If the transformation fails, it keeps the prior state. The model generates the changes and any new content; retained material comes directly from the existing state.

The harness constrains execution and structural validity, not the contents or organization the agent chooses for its memory.

## 2. Compaction within a single tool result

Suppose a search returns four code matches about expiry. Two concern password resets; the others concern image caching and billing. The agent wants to keep the password-reset evidence exactly, including the source text, paths, and line numbers.

It can locate the result by its structure, select records by their contents, and add a note in the same tool result:

```js
const result = state
  .flatMap(message => message.parts)
  .find(part =>
    part.type === "toolResult" &&
    part.content.some(item =>
      item.type === "object" && Array.isArray(item.data.matches)
    )
  );

const evidence = result.content.find(
  item => item.type === "object" && Array.isArray(item.data.matches)
);

evidence.data.matches = evidence.data.matches.filter(
  match => /^auth\/.*reset\.ts$/.test(match.path)
);

result.content.push({
  type: "text",
  text: "Agent memory edit: kept 2/4 password-reset matches verbatim."
});
return state;
```

The retained records come directly from the existing state. Everything outside the edit stays intact, and the note identifies the selection as the agent's own intervention. The [runnable example](examples/02-annotated-evidence/) includes the input and output states. The same operation can select a small amount of evidence from a much larger response.

The same approach can locate parts through surrounding content—for example, the first image following a recognized passage—even when their array positions are unknown.

This control extends to every supported level of the representation. The agent can shorten a verbose explanation while keeping the user's original request, combine related information from several messages, or reorganize most of its context. Code supplies operations for finding and transforming existing data as well as inserting new text. The compaction can be as local or as extensive as the agent judges useful.

## 3. Learning when and how to compact

`evolve` is available during the agent's work. The agent decides when to call it and what transformation to write. The harness can also request a compaction, for example as the context approaches a limit.

The aim is to maximize the quality of the resulting context while minimizing the cost of the compaction. That cost depends partly on where the agent edits. Under exact-prefix prompt caching, an unchanged beginning can be reused on the next call. Changing an early part can invalidate reuse of everything after it, even when the later content itself remains identical.

Compaction has two immediate token costs: generating the `evolve` tool call and processing the part of the resulting input that cannot reuse the prompt cache. The cache component is:

```text
Cache Cost = resultingInputTokens - reusablePrefixTokens

Compaction Cost = evolveCallTokens + Cache Cost
```

The reusable prefix must be measured over the complete serialized model input, including system instructions and tool definitions. The [cost helper](src/cache-cost.ts) computes this cache component from the longest identical prefix of supplied token sequences; actual cache hits also depend on provider serialization and cache availability.

A small edit near the end can therefore have a different cost from a change near the beginning. A larger reorganization might still repay its cost through better subsequent work. Preserving content directly also saves the output tokens that would otherwise be needed to reproduce it. These effects mean that the timing and extent of compaction should be evaluated together.

Position is therefore part of the memory policy. Material near the beginning is expensive to revise and should become increasingly stable, while ongoing work remains nearer the end. The agent must learn when knowledge is established enough to move forward and when revising earlier memory is worth losing cache reuse.

Reinforcement learning trains these decisions from their effects on continued work. The objective combines task completion with total resource use, including Compaction Cost and subsequent inference. The action remains a general JavaScript transformation rather than a fixed set of edit operations or a prescribed memory schema. Strategies for selecting, organizing, annotating, and revising memory are learned through what succeeds across the task. The policy may make frequent small edits, compact larger sections occasionally, or combine both.

## 4. What repeated compaction can develop

The intended setting is one agent continuing the same task across many compactions, potentially for hours or days. Each compaction changes the memory from which it interprets later observations and chooses later actions. Further experience then changes the basis of the next compaction. This repeated feedback, rather than a single act of compression, is what allows the agent to develop.

Consider an agent working on a mathematical problem. It explores approaches, makes calculations, tests conjectures, and proves results. At first, the proved results are scattered among the attempts that produced them.

The first compaction brings the results and their proofs together after the problem. It keeps the reasons earlier approaches failed and the next direction to explore.

![First compaction, before and after: results scattered through exploration become a foundation of proved knowledge, failed routes, and the next approach.](assets/compaction-01.svg)

*Green blocks mark established knowledge. These are schematic snapshots; block heights do not represent token counts.*

Working from those results, the agent proves a third and finds a generalization of the first. These discoveries enter at the end as the new work unfolds.

The next compaction incorporates the generalization into the first result, places the third with the other established knowledge, and updates the next step. The agent can keep the exact proofs while changing their organization.

![Second compaction, before and after: new exploration extends the foundation with a third result and a generalization of the first, with their proofs retained.](assets/compaction-02.svg)

Over these cycles, the agent has developed a foundation from its own work. This can include lessons about its methods as well as mathematical results. After several failed proof attempts, it might learn to search for counterexamples earlier and carry that practice into its next attempt.

The agent's identity develops through this accumulated experience: what it knows, how it works, and what it has learned about its own abilities and mistakes. Each compaction changes the state that guides its subsequent decisions, while further experience can strengthen or revise it. This is the sense in which the agent is self-evolving: it learns through changes to its own persistent working memory while its model weights remain fixed.

## 5. Evaluating the mechanism

The execution mechanism makes these edits possible. The research question is whether an agent can learn a sequence of compactions that improves task completion across long tasks at a worthwhile total cost.

Compare the proposed mechanism with existing compaction methods using the same model, tasks, tools, context limit, and inference budget. An organized summary should be allowed to build the same kind of foundation shown above. A comparison with a fixed set of structured edit operations would test how much the expressiveness of JavaScript contributes.

Tasks should make earlier evidence, corrections, and learned practices matter across several compactions. Measure task success, exact constraint and evidence preservation, repeated mistakes, tokens, latency, and actual cache use. For a learned policy, report training resources separately. A shorter context is useful only insofar as it supports the work and its resource budget.

An agent can also preserve an incorrect conclusion or discard a detail it later needs. Its compaction decisions change the inputs from which subsequent decisions are made, so their effects can persist. Evaluation should inspect whether retained lessons influence behavior and whether the agent revises them when contradicted by experience. Delayed consequences and the changing inputs also make reinforcement learning a substantive part of the research problem. The [evaluation notes](docs/evaluation.md) give a fuller experimental outline.

Existing systems already investigate self-managed memory and context restructuring. [MemGPT](https://arxiv.org/abs/2310.08560) manages memory tiers; [AgentFold](https://arxiv.org/abs/2510.24699) restructures context at different scales. Google's [AnchoredContextCompactor](https://adk.dev/api-reference/typescript/classes/AnchoredContextCompactor.html) maintains a working state at the start of the context and incorporates later events into it. [Context-Folding and FoldGRPO](https://arxiv.org/abs/2510.11967) and [FoldAct](https://arxiv.org/abs/2512.22733) study learning to manage context. Executable transformations of the current messages and parts should be evaluated against these existing capabilities.

## 6. Reference implementation

The prototype uses QuickJS to execute model-written JavaScript with bounded resources and no external access. It validates message and part structure and tool-call relationships before accepting a replacement. System instructions and tool definitions remain outside mutable state. The [integration boundary](src/apply-mutation.ts) handles successful and failed edits; the [design notes](docs/design.md) specify execution limits, provider requirements, and harness responsibilities.

Three hand-written examples demonstrate [shortening a model explanation](examples/01-selective-compression/), [selecting exact evidence](examples/02-annotated-evidence/), and [consolidating a corrected task](examples/03-current-task/). The repository includes no live provider adapter, reinforcement-learning training, or measured agent-performance results. Token and cache accounting require a provider integration.

With Node.js 22 or later and pnpm 11.19.0, run:

```sh
pnpm install --frozen-lockfile
pnpm check
```

The checks cover types, execution and validation, failure isolation, prefix arithmetic, and reproduction of the examples.

---

By Lukas Brückner. Citation metadata is available in [CITATION.cff](CITATION.cff). The current rights notice is in [LICENSE](LICENSE).
