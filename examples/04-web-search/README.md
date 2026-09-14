# Edit a web-search result through its query

This runnable, synthetic example demonstrates the search edit in the prototype's custom State format. Chapter 3 uses OpenAI Responses API items for the same selection mechanism. Inspect the [input State](before.json), [TypeScript transformation](mutation.ts), [JavaScript function body](mutation.js), and [expected State](after.json). No web requests are made.

The input includes an earlier search with a different query. The edit must select the restoration search, follow its call identifier, and keep the two records on the observatory domain. A lookalike domain is excluded. The note is a separate text part; the search-result object retains its schema. All other messages stay intact.

From the repository root, run `pnpm examples`. The runner executes the JavaScript in QuickJS and checks the complete output against the expected State, including preservation of the original input.
