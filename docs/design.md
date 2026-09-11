# Design

## Context and transcript

The transcript records what the user and assistant actually exchanged. Working state is what the next model invocation receives. Ordinary interactions append to both as appropriate; a mutation changes working state only. An integrating harness is responsible for storing the transcript separately.

The model can edit earlier user, model, and tool messages. It can keep exact passages, synthesize new ones, move information, and add commentary. Provenance markers in the examples are illustrative strategies. The runtime validates structure, not the truth of an annotation or the wisdom of removing a passage.

System instructions and tool definitions remain outside the mutable State in this prototype.

## Representation and bijection

[state.ts](../src/state.ts) is the canonical, JSON-compatible representation supported by this implementation. JSON serialization and parsing preserve its values. The executor rejects unsupported shapes and non-finite numbers. Serialization does not promise to preserve JavaScript object identity or non-JSON behavior.

The intended provider adapter maps supported messages and parts into the format the model receives. The bijection must preserve content, order, and tool relationships without prescribing how the structure appears to the model. Given the State types, the model can express selections through content and relationships in code, resolving positions and IDs during execution. A second full JSON copy should not be necessary.

This repo does not establish a universal bijection across provider APIs. A real adapter must test roundtrips and handle provider-only metadata. Opaque reasoning payloads are outside this prototype's type set. Extending it requires explicit replay rules; silently dropping them would violate the premise.

[buildSystemSuffix](../src/build-system-suffix.ts) returns the original system suffix, including its State declaration, with the tool renamed to `evolve`. Whether models can reliably locate State values through content and structure from a provider's presentation is an evaluation question; different addressing strategies can be compared experimentally.

## Mutation boundary

The live integration entry point is [applyMemoryMutation](../src/apply-mutation.ts).

1. Complete outstanding ordinary tools and append their results.
2. Receive a standalone `evolve` call and append it as the last model message.
3. Pass this full state, including that call, to the executor.
4. Validate the returned state and require the final call message to remain exact.
5. Append a success result to the replacement state, or an error result to the original state.
6. Resume model generation from that returned state.

The model must issue mutation alone at this boundary. Streaming harnesses must finish the message and avoid scheduling concurrent state changes while it runs. This reference function returns a replacement; the integrating harness commits it and manages concurrency.

Only the in-flight call is protected. Older mutation calls and receipts can be removed together like any completed roundtrip. Keeping the active call is a local protocol decision, not a restriction on the broader research idea.

The lower-level `executeMutation` is useful for snapshots and examples without an active call. It accepts a completed state and returns a validated replacement. The four illustrative snippets target those snapshots.

## Execution and failure

The function body is executed synchronously by QuickJS. Defaults are 250 ms of execution time, a 16 MiB guest heap, 256 KiB stack, 64 KiB source, and 1 MiB each for serialized input and output. Initialization of the WASM module is outside the execution deadline.

There are no injected host IO functions or module loader. Node hosts the reference program; it never evaluates generated JavaScript itself. Runtime, context, and handles are disposed after each execution. Results cross the boundary as JSON and are validated on the host.

An exception, deadline, allocation failure, invalid output, or protected-tail edit prevents replacement. Edits to the isolated copy cannot change the original state. The validator enforces allowed roles and parts, unique call IDs, and matching ordered tool results. These are portable prototype rules, not a complete validator for every provider.

The interpreter boundary is not an OS process boundary. Guest limits do not provide a hard cap on total Node/WASM memory, and interrupts are cooperative. A production deployment can add a worker or process boundary with a host watchdog. No production isolation claim is made here.

## Cache accounting

The intended objective balances future context quality with resource cost. The exact-prefix model separates generated tool-call tokens from the cache cost of the resulting input:

```text
cacheCost = afterTokens - reusablePrefixTokens
compactionCost = alpha * evolveCallTokens + cacheCost
```

`alpha` weights an output token relative to an uncached input token, so compactionCost is in input-token equivalents. For price-based weighting, use the output-to-uncached-input token price ratio. Integrations must supply this weight; report it alongside evaluation costs.

[estimateCacheCost](../src/cache-cost.ts) compares two token arrays and counts the longest identical prefix. The supplied sequences must describe complete serialized model inputs, including stable system/tool material and the mutation receipt where applicable. Comparing only `JSON.stringify(state)` would not measure provider prompt caching.

The shared prefix is a reuse opportunity, not an observed cache hit. Cache residency, provider block sizes, supported modalities, and provider serialization affect actual reuse. An adapter should distinguish its estimate from usage reported by the provider.

This release has no provider serializer or tokenizer integration. The mutation receipt therefore reports success or failure only; it does not fabricate token metrics. Integrations can attach measured counts after constructing the next request. Local examples report JSON bytes strictly as fixture sizes.

Cache-invalidated input is only one cost. Evaluation should also count generated mutation code, execution time, ordinary input/output, and future calls. A rewrite that is costly once can still reduce the total cost of completing a task.
