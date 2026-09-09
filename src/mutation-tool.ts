export const evolveToolDescription = `Rewrite your current memory into a better state for future work.

Memory is limited, and unnecessary context consumes tokens and can reduce the quality of future work. This tool lets you manage your memory directly.

It executes the JavaScript in \`code\` against the structured \`State\` corresponding to the memory you currently see. The returned state becomes your new memory. You can make changes as small as editing one part or as large as restructuring most of the state.

Changing memory has a Compaction Cost. Prompt caching survives only through the longest unchanged prefix, so Compaction Cost is the number of tokens in the resulting memory that are no longer cached.

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
   * Compaction Cost is the number of tokens in the resulting memory that
   * cannot reuse the current prompt cache.
   *
   * The cache is preserved only through the longest exact prefix shared by
   * the current and resulting memory:
   *
   *   Compaction Cost =
   *     resultingMemoryTokens - unchangedPrefixTokens
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
      code: { type: "string", description: "JavaScript executed as the body of:\n\n  function evolve(state: State): State\n\n`state` is the structured representation of your current memory.\nThe returned State replaces your current memory.\n\nYou may keep, remove, edit, move, merge, or add messages and parts.\n\nCompaction Cost is the number of tokens in the resulting memory that\ncannot reuse the current prompt cache.\n\nThe cache is preserved only through the longest exact prefix shared by\nthe current and resulting memory:\n\n  Compaction Cost =\n    resultingMemoryTokens - unchangedPrefixTokens\n\nChanges near the beginning can therefore have a much higher cost than\nchanges near the end.\n\nPreserve existing content exactly when changing it provides too little\nbenefit to justify its Compaction Cost." },
    },
    required: ["code"],
    additionalProperties: false,
  },
} as const;
