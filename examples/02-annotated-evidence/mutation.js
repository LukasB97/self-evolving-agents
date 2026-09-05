const result = state[2].parts[0];
const matches = result.content[0].data.matches;
result.content[0].data.matches = [matches[0], matches[2]];
result.content.push({
  type: "text",
  text: "Memory edit by the agent: retained 2 of 4 matches verbatim. Removed image-cache and billing expiry matches as unrelated to password resets.",
});
return state;
