/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
import { splitTopLevelStatements, stripAndValidateComments } from "./parser";
import { evaluateFlatExpression } from "./eval";
import { interpretBlock, interpretBlockInPlace } from "./interpret/statements";
import { interpretExpression } from "./interpret/expressions";
import { hasYield } from "./types";

import { ensureMapEnv, Env } from "./env";

export function interpret(input: string, env: Env = {}): number {
  // Normalize env to Map so downstream code can assume a Map-based env when needed
  env = ensureMapEnv(env);
  // Strip and validate C-style comments before parsing
  let s = stripAndValidateComments(input).trim();

  // If this is a top-level match expression, delegate to the expression evaluator
  // early so match bodies are not accidentally pre-processed as braced blocks.
  if (/^match\b/.test(s)) {
    return evaluateFlatExpression(s, env);
  }

  // Helper: check for semicolons at top-level (not nested inside braces/parens)
  function hasTopLevelSemicolon(str: string) {
    return splitTopLevelStatements(str).length > 1;
  }

  // Count `fn` tokens that are at depth 0 (not nested inside parens/braces).
  // This lets us detect multiple top-level `fn` declarations appearing in the same
  // top-level statement (e.g., `fn a() => {} fn b() => {}`) which is disallowed
  // unless separated by a top-level semicolon.
  function countTopLevelFns(str: string) {
    // Strip out nested (...) and {...} groups iteratively, then count `fn` in the
    // remaining top-level surface. This avoids duplicating the parser's depth-scan loop.
    let surface = str;
    const groupRegex = /\([^()]*\)|\{[^{}]*\}/g;
    // Keep replacing innermost groups until none remain.
    while (groupRegex.test(surface)) {
      surface = surface.replace(groupRegex, (m) => " ".repeat(m.length));
    }
    const matches = surface.match(/\bfn\b/g);
    return matches ? matches.length : 0;
  }

  const fnTopLevelCount = countTopLevelFns(s);
  if (fnTopLevelCount > 1 && !hasTopLevelSemicolon(s)) {
    throw new Error("duplicate declaration");
  }

  const isBracedOnly = /^\s*\{[\s\S]*\}\s*$/.test(s);
  if (isBracedOnly) {
    // Braced blocks are lexically scoped: declarations inside must NOT leak to
    // the outer environment.
    s = s.replace(/^\{\s*|\s*\}$/g, "");
    try {
      return interpretBlock(s, env, interpret);
    } catch (e: unknown) {
      // Convert `yield` signals to numeric returns for top-level braced blocks
      if (hasYield(e)) {
        return e.__yield;
      }
      throw e;
    }
  }

  if (
    hasTopLevelSemicolon(s) ||
    /^let\b/.test(s) ||
    /^struct\b/.test(s) ||
    /^while\b/.test(s) ||
    /^for\b/.test(s) ||
    /^fn\b/.test(s)
  ) {
    // Top-level statement sequences should register declarations into the
    // provided env so callers can reuse the environment across calls.
    return interpretBlockInPlace(s, env, interpret);
  }

  return interpretExpression(s, env, interpret);
}

// Expose interpret on globalThis so other modules can call it without causing
// cyclical require() calls in environments where require() is not available.
globalThis.interpret = interpret;
