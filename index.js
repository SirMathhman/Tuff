export function executeTuff(source) {
  if (source.trim() === "") return 0;

  // Validate matching braces
  const depth = [];
  for (const ch of source) {
    if (ch === "{") depth.push("{");
    else if (ch === "}") {
      if (depth.length === 0 || depth.pop() !== "{")
        throw new Error("Mismatched braces");
    } else if (ch === "(") depth.push("(");
    else if (ch === ")") {
      if (depth.length === 0 || depth.pop() !== "(")
        throw new Error("Mismatched parentheses");
    }
  }
  if (depth.length > 0)
    throw new Error("Unmatched opening brace or parenthesis");

  const jsSource = source.replace(/\{/g, "(").replace(/\}/g, ")");
  const result = new Function(`return (${jsSource})`)();
  return typeof result === "number" ? result : Number(result);
}
