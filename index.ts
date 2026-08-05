import { tokenize } from "./src/tokenize";
import { evaluateTokens } from "./src/evaluate";

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (!trimmed) return 0;
  const tokens = tokenize(trimmed);
  return evaluateTokens(tokens);
}
