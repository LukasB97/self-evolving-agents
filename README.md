# Self-Evolving Agents

Long-running agents must compact their context while preserving information needed for further work. We propose treating that context as editable working memory. The agent writes code that locates and transforms existing messages and their parts, preserving selected material exactly and generating only the edits and new content. Repeated compactions can develop a stable, revisable core of knowledge and working practices. We propose training these decisions through their effects on task performance and resource use, accounting for both generated code and prompt-cache reuse. A reference implementation demonstrates execution and validation; reliable model use and benefits across long tasks remain to be evaluated.

## 1. Long-running agents and compaction

As agents take on longer tasks, a single run can span hours or days. Throughout that run, user messages, model responses, tool calls, and tool results accumulate. We call this complete sequence of messages the **history**.

At each invocation, the model receives a **context**, also a sequence of messages, containing the information available for its next step. Early in a run, this context can include the entire history. As the run continues, the accumulated material can exceed the model’s context window.

**Compaction** transforms the current context into a smaller representation from which the agent can continue. It can summarize earlier work, remove unnecessary material, and retain relevant details. The resulting context may therefore contain both original and rewritten messages. Its usefulness depends on preserving the information needed for subsequent work.

The compacted context becomes the basis for further model calls, leaving room for new information. The full history remains stored separately. Through repeated compactions, an agent can continue working beyond the amount of history that fits into a single context window.

Compaction determines what the agent carries forward into its next steps. A detail removed now may be needed later, while unnecessary material occupies space that could support new work. How should an agent decide what to preserve, what to rewrite, and what to remove?

A common approach replaces earlier context with a generated summary, sometimes retaining selected messages alongside it. We propose letting the agent express its compaction decisions as code that transforms the existing messages and their parts. Selected material can be preserved exactly, while the model generates only the transformation code and any new or rewritten content.

## 2. Context as editable working memory

We propose treating the agent’s context as working memory whose contents and organization it can change. During compaction, the agent decides which material to preserve, which passages to rewrite, and where information belongs in the context from which it will continue.

Consider an agent working on a mathematical problem. It explores several approaches and proves two results. As this work unfolds, the proofs appear among calculations, conjectures, and unsuccessful attempts.

The agent can bring the two results and their proofs together near the beginning of its context, following the problem statement. It can condense unsuccessful attempts into explanations of why they failed and retain the next approach to explore. The proofs themselves can be carried forward exactly.

![First compaction: scattered proofs become an organized foundation alongside failed approaches and the next direction.](assets/compaction-01.svg)

*Green blocks mark established knowledge. Block heights are schematic and do not represent token counts.*

As the agent continues, new work is appended to this context. It proves a third result and finds a generalization of the first. At the next compaction, it can incorporate the generalization alongside the original result, place the third result with the existing proofs, and update the next step.

![Second compaction: further work extends and revises the foundation while retaining the proofs.](assets/compaction-02.svg)

Each compaction therefore edits a context that may already contain earlier edits. Material that remains useful can be preserved across these cycles, while new findings give the agent reasons to revise both its content and its organization. The context develops with the work.

## 3. Editing context through code

The agent harness stores context as structured items, including messages, function calls, and function outputs. We call this representation the **State**. The model receives a provider-specific representation of that context. Although it may not see the objects and fields stored by the harness, it can recognize the corresponding content and relationships.

Our proposal is to give the model the State format and let it write code that locates and edits the material it understands. The harness executes that code and uses the resulting State as the context for the next invocation.

### State types

We use the [OpenAI Responses API types](https://developers.openai.com/api/reference/typescript/resources/responses) from the TypeScript SDK. State is an ordered sequence of input items. Messages contain text or other content parts; function calls and their outputs are separate items, connected by `call_id`.

```ts
import type {
  ResponseInputItem,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";

type State = ResponseInputItem[];
```

Function-call arguments are JSON strings. Function outputs can be strings or lists of text, image, and file parts. This allows, for example, a tool result to hold JSON search records alongside an explanatory text part.

### Working with an existing State

Suppose the State contains a web search for *Northbridge Observatory restoration*. The custom search function returned four records as a JSON string, each with a title, URL, and excerpt. We want to retain the two records from the observatory's own website and explain the selection in a separate text part, preserving the JSON schema.

The function below finds the search by its query, follows its `call_id` to the output, and filters the records by URL. The `results` field belongs to this tool's output format; State provides the surrounding item structure.

```ts
type SearchResults = {
  results: {
    title: string;
    url: string;
    excerpt: string;
  }[];
};

function evolve(state: State): State {
  // Find the search call and its output.
  const call = state.find((item): item is ResponseFunctionToolCall => {
    if (item.type !== "function_call" || item.name !== "web_search") return false;
    const args = JSON.parse(item.arguments);
    return typeof args.query === "string" &&
      /Northbridge Observatory.*restoration/i.test(args.query);
  });

  if (!call) throw new Error("Search call not found");

  const result = state.find(
    (item): item is ResponseInputItem.FunctionCallOutput =>
      item.type === "function_call_output" &&
      item.call_id === call.call_id
  );

  if (!result) throw new Error("Search result not found");

  // Keep records from the observatory's website.
  if (typeof result.output !== "string") throw new Error("Expected a JSON string");

  const data = JSON.parse(result.output) as SearchResults;

  if (!Array.isArray(data.results)) throw new Error("Search records not found");

  data.results = data.results.filter(record =>
    /^https?:\/\/northbridge-observatory\.org(?:\/|$)/i.test(record.url)
  );

  // Preserve the JSON schema and explain the selection alongside it.
  result.output = [
    { type: "input_text", text: JSON.stringify(data) },
    {
      type: "input_text",
      text: "Agent memory edit: retained the two results from the observatory's website."
    }
  ];

  return state;
}
```

The retained records keep their original titles, URLs, and excerpts. Serializing the JSON again may change its whitespace and escaping, but preserves these string values. The [runnable example](examples/04-web-search/) demonstrates the same edit in the prototype's custom State format.

We propose letting the agent write this function body and submit it through the `evolve` tool. It expresses the compaction described in Chapter 1: the harness transforms the current State into the State representing the compacted context.

The model can formulate these operations using content and relationships it recognizes in its context. It does not need to reconstruct the entire State or know stored positions and identifiers in advance. It generates the transformation code and any new text, while retained material comes directly from the existing State.

## 4. Agent-controlled compaction

To make context editing available to the agent, the harness provides the State types and an `evolve` tool. Together, they explain how the context is represented and how the agent can change it.

### Connecting the context to State

We place a suffix at the end of the system message, immediately before the working context in the intended input layout. It contains the State types from Chapter 3 and explains that the following context corresponds to this structure. It also establishes that the context may contain earlier edits and that the agent can manage it independently of the full history.

For the supported content, the provider integration must establish a reversible correspondence between State and the model-visible representation, preserving content, order, and tool relationships. The types give the model a structure in which to express edits. Content searches and structural relationships let the code resolve the intended locations during execution.

### Executing an edit

The `evolve` tool accepts JavaScript as the body of a function receiving the current State. The agent generates the code; the harness supplies the data.

The harness executes the code on a copy of State and checks the returned message structure and tool-call relationships. A valid result becomes the replacement State. If execution or validation fails, the previous State remains in place. The harness reports the outcome through a tool result and resumes model generation.

The agent can call `evolve` during its work. The harness can also request a compaction as the context approaches its limit. System instructions and tool definitions remain outside the editable State.

### Accounting for compaction cost

An edit has two immediate token costs. The agent generates the `evolve` call, including its code and any new content. The next model invocation then processes the resulting context.

Prompt caching can reuse computation for an unchanged beginning of the model input. Under an exact-prefix cache, an edit breaks reuse beyond the first changed position, even if later material remains identical. Compare the complete serialized and tokenized model inputs before and after the edit, including system instructions and tool definitions. Their longest identical initial token sequence is the reusable prefix.

**Cache Cost** counts the tokens in the new input outside that prefix. **Compaction Cost** adds the cost of generating the `evolve` call, including its code and new content:

```text
Cache Cost = tokens in the new input − tokens in the reusable prefix
Compaction Cost = generated evolve-call tokens × output-token weight + Cache Cost
```

The output-token weight expresses the cost of one output token relative to one uncached input token. For price-based weighting, divide the output-token price by the uncached-input-token price. Compaction Cost is therefore expressed in input-token equivalents. Actual reuse also depends on the provider's caching behavior and cache availability.

This measure excludes the input-processing cost of the invocation generating `evolve`, cache reads, execution, and later inference. Those belong in total task accounting. It is not a cost difference against continuing without compaction. The [design notes](docs/design.md#cache-accounting) describe the implementation and integration requirements.

### Choosing the extent of an edit

Preserving existing material directly saves the output tokens needed to reproduce it. Where the agent edits also matters. A small change near the end can preserve most of the cached prefix, while a change near the beginning can require much more input to be processed again.

This gives the organization illustrated in Chapter 2 an additional motivation. Material expected to remain stable can be placed earlier in the context, with ongoing exploration appended afterward. Revising that earlier material may still be worthwhile when it improves subsequent work.

Evaluating an edit requires following its effects on task performance and total resource use through the rest of the task.

## 5. Learning how to compact

Compaction is already part of agent systems from providers such as Anthropic and OpenAI. Current systems use injected hints for compaction when the context is almost full. It might emerge that this timing is not preferable at all. We do not yet know which kind of compaction will work best.

We therefore deliberately give the agent broad control over its context and propose learning when and how to use it through reinforcement learning. The available actions are executable transformations of State, evaluated through task outcomes and total resource use, including generated code, prompt-cache reuse, and subsequent work.

Structural validation constrains which results can be accepted, but an accepted edit can still discard useful evidence or introduce misleading information. The contents and organization of memory remain largely the agent’s choice. The annotation in Chapter 3 illustrates one way to explain a change; it is not a required convention.

Memory structures and editing conventions should likewise emerge through training rather than be prescribed in advance.

## 6. Implementation and evaluation

The reference implementation executes JavaScript in QuickJS with bounded time and memory and no external access. It checks the resulting State and tool-call relationships before accepting a replacement; failed edits leave the previous State intact. Four hand-written examples demonstrate [shortening an explanation](examples/01-selective-compression/), [selecting exact evidence](examples/02-annotated-evidence/), [consolidating a corrected task](examples/03-current-task/), and [the web-search edit from Chapter 3](examples/04-web-search/). Automated checks cover execution, validation, failure isolation, cache-prefix arithmetic, and reproduction of these examples.

The prototype has no live provider adapter, trained compaction policy, or measured agent-performance results. Its custom [State format](src/state.ts) differs from the OpenAI types in Chapter 3, and the [validator](src/validate-state.ts) requires JSON-compatible values to preserve data across the execution boundary. A provider integration must establish the correspondence between State and model-visible context and supply token and cache measurements. The [design notes](docs/design.md) describe the execution and integration requirements.

### Evaluation

First, use controlled tasks to test whether the model translates its understanding of context into edits of the intended State values: locating the correct tool call, selecting records, preserving exact passages, and retaining required relationships. Include similar queries, repeated content, and later corrections so that the first matching string is not necessarily the right target. Measure structural validity and correct targeting separately; a valid edit can still change the wrong result or remove a necessary detail.

Then compare task success and total resource use under the same base model, tasks, tools, context limit, and total inference budget. Compare summary-based compaction, fixed structured edit operations, prompted JavaScript transformations, and an RL-trained policy. Summaries should also be allowed to organize knowledge and working practices, so the comparison measures the contribution of executable editing. Tasks should require earlier evidence, corrections, and learned practices across several compactions; shorter tasks can also test whether reorganization helps before the context window fills.

Measure preservation of evidence and constraints, repeated mistakes, total tokens, latency, and actual cache use alongside task success. Retain the history, successive States, and generated transformations to trace later failures to earlier edits. Report training resources and cost weights separately. The [evaluation notes](docs/evaluation.md) develop this plan.

### Related work

[MemGPT](https://arxiv.org/abs/2310.08560) studies model-directed management of memory tiers; [AgentFold](https://arxiv.org/abs/2510.24699) condenses historical trajectories at different scales. Both motivate comparing what each interface can preserve and reorganize. [Context-Folding and FoldGRPO](https://arxiv.org/abs/2510.11967) study learning context management through branching and summarization; [FoldAct](https://arxiv.org/abs/2512.22733) addresses training when folding changes subsequent observations. They provide comparisons for learning the compaction policy, discussed further in the [related-work notes](docs/related-work.md).

The contribution to investigate combines model-written code over structured context, direct preservation of existing material, and decisions informed by generation cost and cache reuse.

### Running the prototype

With Node.js 22 or later and pnpm 11.19.0, install dependencies and run the checks,

```sh
pnpm install --frozen-lockfile
pnpm check
```

Run `pnpm examples` to execute just the four [examples](examples/).

---

By Lukas Brückner. Citation metadata is available in [CITATION.cff](CITATION.cff). The current rights notice is in [LICENSE](LICENSE).
