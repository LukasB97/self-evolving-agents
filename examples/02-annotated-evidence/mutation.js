const result = state
  .flatMap(message => message.parts)
  .find(part =>
    part.type === "toolResult" &&
    part.content.some(item =>
      item.type === "object" && Array.isArray(item.data.matches)
    )
  );

const evidence = result.content.find(
  item => item.type === "object" && Array.isArray(item.data.matches)
);

evidence.data.matches = evidence.data.matches.filter(
  match => /^auth\/.*reset\.ts$/.test(match.path)
);

result.content.push({
  type: "text",
  text: "Agent memory edit: kept 2/4 password-reset matches verbatim.",
});
return state;
