import { Result, err, ok } from "./result";
import { Token } from "./tokenize";

export function splitTopLevelCommaSeparated(
  tokens: Token[]
): Result<Token[][], string> {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let parenDepth = 0;
  let braceDepth = 0;

  for (const t of tokens) {
    if (t.type === "paren") {
      parenDepth += t.value === "(" ? 1 : -1;
    } else if (t.type === "punct" && t.value === "{") {
      braceDepth++;
    } else if (t.type === "punct" && t.value === "}") {
      braceDepth--;
    }

    const isTopLevelComma =
      t.type === "punct" &&
      t.value === "," &&
      parenDepth === 0 &&
      braceDepth === 0;

    if (isTopLevelComma) {
      if (current.length === 0) return err("Invalid numeric input");
      parts.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }

  if (current.length > 0) parts.push(current);
  return ok(parts);
}
