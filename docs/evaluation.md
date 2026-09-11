# Evaluation proposal

The current fixtures test that transformations execute correctly. They are hand-written and provide no evidence yet that a model selects good transformations.

## Main question

Can an agent improve its subsequent task performance and total resource use by editing its own structured state?

## Comparisons

Use the same base model, task set, tools, context limit, and total budget for:

1. Append-only context, with a documented policy when the window fills.
2. Summary-based compaction at a fixed threshold.
3. Prompted executable mutations, chosen by the model.
4. An RL-trained mutation policy, once a training implementation exists.

Record all overhead, including any summarizer calls. An ablation with structured edit operations instead of JavaScript would test whether code expressiveness itself helps.

## Tasks

Begin with short controlled tasks containing exact constraints, later corrections, irrelevant tool output, and information that becomes relevant again. Then use longer tasks with verifiable outcomes, such as code changes checked by hidden tests or evidence retrieval checked against a known source set.

Include tasks that finish well below the context limit. That tests whether reorganization has value beyond making room.

## Measurements

- Final task success and preservation of exact user constraints.
- Mistakes caused by lost evidence, stale assumptions, or confusion about agent-authored notes.
- Total input and output tokens, actual reported cache usage, latency, and mutation execution time.
- Rejected transformations, incorrect message targeting, and failures to preserve tool relationships.
- Performance several steps after an edit, including when discarded information becomes useful again.

Preserve the original transcript, every state version, generated code, model/settings, and task seed in experimental records. Use repeated runs and report uncertainty. Score outcomes independently of how readable a summary appears.

## RL direction

Let the policy choose a mutation, continue the task from the replacement state, and learn from downstream outcomes and costs. Representation strategies, such as provenance notes or asymmetric compression of user and model messages, can remain learned choices.

Rewarding shorter state alone would encourage destructive forgetting. A candidate objective combines task success with total resource cost, with weights and constraints reported explicitly. Credit assignment across delayed outcomes and shifting observations is an unresolved training problem; the [related work](related-work.md) includes relevant approaches.

## Results

No model experiments or RL runs have been performed for this release. Automated checks cover executor behavior, failure atomicity, state validation, prefix-cost arithmetic, and reproduction of four synthetic examples.
