export type CacheCost = {
  beforeTokens: number;
  afterTokens: number;
  reusablePrefixTokens: number;
  compactionCost: number;
};

/** Ideal exact-prefix model. Supply tokens of the complete serialized model input. */
export function estimateCacheCost(before: readonly number[], after: readonly number[]): CacheCost {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  return {
    beforeTokens: before.length,
    afterTokens: after.length,
    reusablePrefixTokens: prefix,
    compactionCost: after.length - prefix,
  };
}
