# Preserve the request, shorten the explanation

The user's exact constraint stays intact. The assistant's explanation becomes its plan,
including the retry schedule it introduced. The rewrite does not claim the plan has
already been implemented.

Inspect [before](before.json), the two-line [mutation](mutation.js), and [after](after.json).
This hand-written fixture illustrates a possible agent decision; it is not an evaluation
of a model's ability to make that decision.
