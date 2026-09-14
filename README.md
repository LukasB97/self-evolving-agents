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

The agent can edit the structured context that its harness already uses for model calls. For a concrete format, we use the OpenAI Responses API's [input items](https://developers.openai.com/api/reference/typescript/resources/responses), represented by `ResponseInputItem` in the TypeScript SDK. **State** is an ordered array of these items.

Messages carry content such as text, images, and files. Function calls and their outputs are separate items, linked by `call_id`. The harness supplies these type definitions to the agent so it can write code against the stored structure, locating material through content and relationships it recognizes from its context.

### Editing a search result

Suppose the context contains a call to a harness-defined `web_search` function for *Northbridge Observatory restoration*. Its output is a JSON string with four search records, two from the observatory's own website. This is a custom function with a known result schema; OpenAI's built-in web search has a different item format.

The following transformation finds the call by its query, follows its `call_id`, and filters the records by URL. It assumes one matching call and a result conforming to the search tool's schema.

```ts
import type { ResponseInputItem } from "openai/resources/responses/responses";

type State = ResponseInputItem[];

type SearchResults = {
  results: { title: string; url: string; excerpt: string }[];
};

function evolve(state: State): State {
  const call = state.find(item => {
    if (item.type !== "function_call" || item.name !== "web_search") return false;
    const args = JSON.parse(item.arguments);
    return args.query === "Northbridge Observatory restoration";
  });
  if (!call || call.type !== "function_call") throw new Error("Search call not found");

  const result = state.find(item =>
    item.type === "function_call_output" && item.call_id === call.call_id
  );
  if (!result || result.type !== "function_call_output" || typeof result.output !== "string") {
    throw new Error("Search result not found or not a string");
  }

  const data: SearchResults = JSON.parse(result.output);
  data.results = data.results.filter(record =>
    /^https?:\/\/northbridge-observatory\.org(?:\/|$)/i.test(record.url)
  );
  result.output = [
    { type: "input_text", text: JSON.stringify(data) },
    { type: "input_text", text: "Agent memory edit: retained the observatory's own results." }
  ];
  return state;
}
```

The retained titles, URLs, and excerpts keep their original string values. JSON is parsed and serialized by the code, so whitespace and escaping in the enclosing JSON may change. The selection note is a separate text part in the function output, leaving the search data's schema intact. Other items remain unchanged.

The model generates the transformation and the note. It does not reproduce the retained evidence or need to know array positions and stored identifiers in advance. The [checked example](tests/fixtures/openai-paper-example.ts) uses the SDK types; the [paper tests](tests/paper-example.test.ts) verify selection and preservation with synthetic data.

### Applying the transformation

The agent submits the JavaScript function body through `evolve`; the import and type declarations above describe its environment. The harness executes it on a copy of State and validates the result before adopting it, as described in Chapter 4.

This design uses [manually managed conversation state](https://developers.openai.com/api/docs/guides/conversation-state): the edited items form the next request's `input`, with system instructions and tool definitions supplied separately. The harness must not also replay the unedited history through `previous_response_id` or a server-managed conversation.

Using API types does not make every field editable text. Required [reasoning items](https://developers.openai.com/api/docs/guides/function-calling) must accompany tool continuations; opaque payloads must be carried forward unchanged according to the API's replay rules. Provider acceptance and correct targeting still require evaluation. The current prototype uses a smaller custom State format, described in Chapter 6.

## 4. Agent-controlled compaction

To make context editing available to the agent, the harness provides the State types and an `evolve` tool. Together, they explain how the context is represented and how the agent can change it.

### Connecting the context to State

We place a suffix at the end of the system message, immediately before the working context in the intended input layout. It contains the types for the chosen State representation and explains that the following context corresponds to this structure. It also establishes that the context may contain earlier edits and that the agent can manage it independently of the full history.

The provider integration must preserve supported content, order, and tool relationships when constructing model input from State. With the API-native representation in Chapter 3, State already consists of input items; the harness must still follow the API's replay rules. The types give the model a structure in which to express edits. Content searches and structural relationships let the code resolve the intended locations during execution.

### Executing an edit

The `evolve` tool accepts JavaScript as the body of a function receiving the current State. The agent generates the code; the harness supplies the data.

The harness executes the code on a copy of State and checks the returned message structure and tool-call relationships. A valid result becomes the replacement State. If execution or validation fails, the previous State remains in place. The harness reports the outcome through a tool result and resumes model generation.

The agent can call `evolve` during its work. The harness can also request a compaction as the context approaches its limit. System instructions and tool definitions remain outside the editable State.

### Accounting for compaction cost

An edit has two immediate token costs. The agent generates the `evolve` call, including its code and any new content. The next model invocation then processes the resulting context.

Prompt caching can reuse computation for an unchanged beginning of the model input. Under an exact-prefix cache, an edit breaks reuse beyond the first changed position, even if later material remains identical. We call the number of resulting input tokens outside the reusable prefix the **Cache Cost**.

Let $I(C)$ denote the complete serialized and tokenized model input for context $C$, including system instructions and tool definitions. Under an exact-prefix model,

$$
\mathrm{CacheCost}(C_t, C'_t) = |I(C'_t)| - \mathrm{LCP}\!\left(I(C_t), I(C'_t)\right).
$$

Here, $|I(C)|$ is the number of input tokens and $\mathrm{LCP}$ is the length of the longest common prefix of the two token sequences.

To combine this with the cost of generating the edit, let $\alpha$ weight an output token relative to an uncached input token. **Compaction Cost**, expressed in input-token equivalents, is then

$$
\text{Compaction Cost} = \alpha \cdot \text{evolveCallTokens} + \text{Cache Cost}.
$$

For price-based weighting, $\alpha$ is the ratio of the corresponding token prices. Actual reuse also depends on the provider's caching behavior and cache availability.

This metric accounts for generating the `evolve` call and processing the resulting input outside the reusable prefix. It excludes the input-processing cost of the model invocation that generates the call, cache reads, execution, and later inference. Those costs belong in the total task accounting. The metric is not a cost difference against a hypothetical continuation without compaction.

### Choosing the extent of an edit

Preserving existing material directly saves the output tokens needed to reproduce it. Where the agent edits also matters. A small change near the end can preserve most of the cached prefix, while a change near the beginning can require much more input to be processed again.

This gives the organization illustrated in Chapter 2 an additional motivation. Material expected to remain stable can be placed earlier in the context, with ongoing exploration appended afterward. Revising that earlier material may still be worthwhile when it improves subsequent work.

Compaction Cost captures the immediate generation and uncached-input costs. Evaluating an edit requires following its effects through the rest of the task, including cache reads, execution, and subsequent inference. The agent must learn when an edit's benefit to continued work justifies its cost.

## 5. Learning how to compact

The `evolve` tool gives the agent a powerful way to edit its context. Choosing useful edits requires deciding what to preserve, revise, or remove, how often to compact, and when the benefit to further work justifies the cost.

Compaction is already part of agent systems from providers such as Anthropic and OpenAI. Current systems use injected hints for compaction when the context is almost full. It might emerge that this timing is not preferable at all. We do not yet know which kind of compaction will work best.

We therefore deliberately give the agent broad control over its context and propose learning when and how to use it through reinforcement learning. The available actions are executable transformations of State, evaluated through task outcomes and total resource use, including generated code, prompt-cache reuse, and subsequent work.

Structural validation constrains which results can be accepted, but an accepted edit can still discard useful evidence or introduce misleading information. The contents and organization of memory remain largely the agent’s choice. The annotation in Chapter 3 illustrates one way to explain a change; it is not a required convention.

This openness allows training to discover effective approaches to compaction, including its timing, extent, and the structures or conventions it uses. These choices should develop through their consequences for continued work rather than be prescribed in advance.

## 6. Implementation and evaluation

The repository provides a reference implementation of the editing mechanism. It executes transformations and validates their results. Evaluating the proposal requires establishing whether agents can use that mechanism reliably and whether their edits improve continued work.

### Reference implementation

The prototype executes JavaScript in QuickJS with bounded time and memory and no external access. It checks the returned State and its tool-call relationships before accepting a replacement. Failed edits leave the previous State intact.

Four hand-written examples demonstrate [shortening an explanation](examples/01-selective-compression/), [selecting exact evidence](examples/02-annotated-evidence/), [consolidating a corrected task](examples/03-current-task/), and [a web-search edit](examples/04-web-search/) in the prototype format. Automated checks cover execution, validation, failure isolation, cache-prefix arithmetic, and reproduction of those examples.

The implementation currently has no live provider adapter, trained compaction policy, or measured agent-performance results. A provider integration must establish the correspondence between State and model-visible context and supply token and cache measurements.

The [implementation types](src/state.ts) define the prototype's custom message-and-part format. They do not yet implement the OpenAI representation used in Chapter 3; adopting it in the runtime requires updating validation and the system suffix as well as adding a provider integration. The [validator](src/validate-state.ts) additionally requires JSON-compatible values so that State can cross the execution boundary without losing data. The [design notes](docs/design.md) describe the execution and integration requirements.

With Node.js 22 or later and pnpm 11.19.0, install dependencies and run the checks,

```sh
pnpm install --frozen-lockfile
pnpm check
```

Run `pnpm examples` to execute just the four examples.

### Reliable editing

The first evaluation question is whether the model can translate its understanding of context into edits of the intended State values.

Controlled tasks can test whether it locates the correct tool call, selects the intended records, preserves exact passages, and keeps required relationships intact. These tasks should include similar search queries, repeated content, and later corrections, so that identifying the right material requires more than finding the first matching string.

Structural validity and correct targeting should be measured separately. An edit can produce a valid State while changing the wrong result or removing a necessary detail.

### Benefits across continued work

The second question is whether these edits improve task completion at a worthwhile total cost. Comparisons should use the same base model, tasks, tools, context limit, and total inference budget.

Relevant comparisons include summary-based compaction, fixed structured edit operations, prompted JavaScript transformations, and an RL-trained compaction policy. Summary-based methods should be allowed to organize knowledge and working practices, so that evaluation measures the contribution of executable editing itself.

Tasks should require earlier evidence, corrections, and learned practices across several compactions. Shorter tasks can also test whether context reorganization helps before the context window fills.

Measure task success, preservation of evidence and constraints, repeated mistakes, total tokens, latency, and actual cache use. Retain the history, successive States, and generated transformations so that later failures can be traced to earlier edits. Training resources and cost weights should be reported separately.

### Relation to existing work

[MemGPT](https://arxiv.org/abs/2310.08560) investigates model-directed management of memory tiers, while [AgentFold](https://arxiv.org/abs/2510.24699) condenses historical trajectories at different scales. These approaches motivate comparing what an agent can preserve and reorganize through each interface. [Context-Folding and FoldGRPO](https://arxiv.org/abs/2510.11967) study learning to manage context through branching and summarization; [FoldAct](https://arxiv.org/abs/2512.22733) addresses training when context folding changes subsequent observations. They provide relevant comparisons for training the compaction policy. The [related-work notes](docs/related-work.md) develop these connections further.

The contribution to investigate is the combination of model-written code over structured context, direct preservation of existing material, and decisions informed by the cost of both generation and cache reuse. The reference implementation makes this mechanism concrete. Its reliability and benefits across long-running tasks remain to be established.

---

By Lukas Brückner. Citation metadata is available in [CITATION.cff](CITATION.cff). The current rights notice is in [LICENSE](LICENSE).
