/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
import { splitTopLevelStatements } from "./parser";
import { evaluateFlatExpression } from "./eval";
import { interpretBlock } from "./interpret/statements";
import { interpretExpression } from "./interpret/expressions";

export function interpret(
  input: string,
  env: Record<string, any> = {}
): number {
  let s = input.trim();

  // If this is a top-level match expression, delegate to the expression evaluator
  // early so match bodies are not accidentally pre-processed as braced blocks.
  if (/^match\b/.test(s)) {
    return evaluateFlatExpression(s, env);
  }

  // Helper: check for semicolons at top-level (not nested inside braces/parens)
  function hasTopLevelSemicolon(str: string) {
    return splitTopLevelStatements(str).length > 1;
  }

  // If there are multiple `fn` declarations without top-level semicolons, treat as an error
  // (we require semicolons between top-level declarations)
  const fnCount = (s.match(/\bfn\b/g) || []).length;
  if (fnCount > 1 && !hasTopLevelSemicolon(s)) {
    throw new Error("duplicate declaration");
  }

  if (
    hasTopLevelSemicolon(s) ||
    /^let\b/.test(s) ||
    /^struct\b/.test(s) ||
    /^\s*\{[\s\S]*\}\s*$/.test(s)
  ) {
    if (/^\s*\{[\s\S]*\}\s*$/.test(s)) s = s.replace(/^\{\s*|\s*\}$/g, "");
    return interpretBlock(s, env, interpret);
  }

  return interpretExpression(s, env, interpret);
}

// Expose interpret on globalThis so other modules can call it without causing
// cyclical require() calls in environments where require() is not available.
(globalThis as any).interpret = interpret;
