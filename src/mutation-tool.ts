export const evolveToolDescription = `Rewrite your current memory into a better state for future work.

Memory is limited, and unnecessary context consumes tokens and can reduce the quality of future work. This tool lets you manage your memory directly.

It executes the JavaScript in \`code\` against the structured \`State\` corresponding to the memory you currently see. The returned state becomes your new memory. You can make changes as small as editing one part or as large as restructuring most of the state.

Wait for all outstanding tool results before calling \`evolve\`. Submit exactly one \`evolve\` call as the only part of your message, with no accompanying text or other tool calls. The harness includes this call as the final message in the State passed to your code. Preserve that entire message exactly and keep it last in the returned State. The harness appends the matching success or error result; your code must not add that result itself. Earlier completed tool calls and their results may be removed together.

Compaction Cost = alpha * evolveCallTokens + Cache Cost. The integration supplies alpha, the cost of an output token relative to an uncached input token; for price-based weighting, this is their token price ratio. Prompt caching survives only through the longest unchanged prefix, so Cache Cost is the number of resulting input tokens that cannot reuse that prefix.

The code runs in an isolated environment with limited time and memory and no external access. Invalid states, broken tool-call relationships, execution failures, and resource-limit violations are rejected.`;

export type EvolveInput = {
  /**
   * JavaScript executed as the body of:
   *
   *   function evolve(state: State): State
   *
   * `state` is the structured representation of your current memory.
   * The returned State replaces your current memory.
   *
   * You may keep, remove, edit, move, merge, or add messages and parts.
   *
   * Cache Cost is the number of tokens in the resulting memory that cannot
   * reuse the current prompt cache. Compaction Cost also includes the tokens
   * generated for this evolve call.
   *
   * The cache is preserved only through the longest exact prefix shared by
   * the current and resulting memory:
   *
   *   Cache Cost =
   *     resultingMemoryTokens - unchangedPrefixTokens
   *
   *   Compaction Cost =
   *     alpha * evolveCallTokens + Cache Cost
   *
   * The integration supplies alpha, the cost of an output token relative to
   * an uncached input token. For price-based weighting, use their token price
   * ratio. Compaction Cost is expressed in input-token equivalents.
   *
   * Changes near the beginning can therefore have a much higher cost than
   * changes near the end.
   *
   * Preserve existing content exactly when changing it provides too little
   * benefit to justify its Compaction Cost.
   */
  code: string;
};

export type EvolveOutput =
  | {
      applied: true;
      beforeTokens: number;
      afterTokens: number;
      cachedPrefixTokens: number;
      evolveCallTokens: number;
      cacheCost: number;
      /** Input-token equivalents: alpha * evolveCallTokens + cacheCost. */
      compactionCost: number;
    }
  | {
      applied: false;
      error: string;
    };

export const evolveTool = {
  name: "evolve",
  description: evolveToolDescription,
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript executed as the body of:\n\n  function evolve(state: State): State\n\n`state` is the structured representation of your current memory.\nThe returned State replaces your current memory.\n\nYou may keep, remove, edit, move, merge, or add messages and parts.\n\nCache Cost is the number of tokens in the resulting memory that cannot\nreuse the current prompt cache. Compaction Cost also includes the tokens\ngenerated for this evolve call.\n\nThe cache is preserved only through the longest exact prefix shared by\nthe current and resulting memory:\n\n  Cache Cost =\n    resultingMemoryTokens - unchangedPrefixTokens\n\n  Compaction Cost =\n    alpha * evolveCallTokens + Cache Cost\n\nThe integration supplies alpha, the cost of an output token relative to\nan uncached input token. For price-based weighting, use their token price\nratio. Compaction Cost is expressed in input-token equivalents.\n\nChanges near the beginning can therefore have a much higher cost than\nchanges near the end.\n\nPreserve existing content exactly when changing it provides too little\nbenefit to justify its Compaction Cost." },
    },
    required: ["code"],
    additionalProperties: false,
  },
} as const;
