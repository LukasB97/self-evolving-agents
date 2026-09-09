export type EvolveInput = {
  /**
   * JavaScript function body executed as evolve(state: State): State.
   * The array is the structured form of your current memory, including this call last.
   * Keep, remove, edit, move, merge, or add earlier messages and parts.
   * Preserve the final mutation-call message exactly; the harness adds its result.
   * Return the resulting array. Execution is synchronous, with no external access.
   *
   * Compaction Cost is the resulting input tokens beyond the unchanged cached prefix.
   * Under ideal prefix reuse: resultingTokens - unchangedPrefixTokens.
   * Earlier edits can force more of the next input to be processed again.
   * Preserve exact content when a change offers too little benefit for that cost.
   */
  code: string;
};

export const evolveTool = {
  name: "evolve",
  description: `Rewrite your current memory into a better state for future work.

Memory is limited. Unnecessary context consumes tokens and can make future work harder.
This tool executes JavaScript against the structured State corresponding to the memory
you see. The returned state replaces your working memory; the user-visible transcript
is kept separately. You may annotate content as well as condense or reorganize it.

Changes have a Compaction Cost: under exact-prefix caching, tokens after the first
change cannot reuse that prior prefix. Balance future context quality with this cost.
Code runs synchronously in isolated QuickJS with time, memory, and output limits.
Invalid states, broken tool roundtrips, and edits to the final mutation call are rejected.
On failure the previous state is preserved and receives an error result.`,
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Body of evolve(state): State. Edit earlier memory; preserve this final call. Return the array. Compaction Cost = resulting input tokens minus reusable exact-prefix tokens; preserve existing text when rewriting offers too little benefit.",
      },
    },
    required: ["code"],
    additionalProperties: false,
  },
} as const;
