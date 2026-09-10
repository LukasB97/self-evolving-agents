# Select evidence and explain the selection

Two search matches are kept exactly. The mutation locates the result by structure and
filters records by their paths rather than using array indices. The same tool result
receives a sibling TextPart explaining the selection.

The short note keeps the fixture smaller while recording the agent's intervention.
The tool-call relationship and user request stay unchanged.

Inspect [before](before.json), [mutation](mutation.js), and [after](after.json).
The selection and note are hand-written to expose the mechanism.
