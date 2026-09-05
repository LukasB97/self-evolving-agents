# Select evidence and explain the selection

Two search matches are kept exactly. The same tool result receives a sibling TextPart
explaining what the agent removed. Structured evidence and the agent's annotation can
coexist without adding a new message or pretending the search tool wrote the note.

The note costs space. This tiny example demonstrates a better-described state, not a
guarantee of fewer bytes. The tool-call relationship and user request stay unchanged.

Inspect [before](before.json), [mutation](mutation.js), and [after](after.json).
The selection and note are hand-written to expose the mechanism.
