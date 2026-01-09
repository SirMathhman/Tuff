import {
  expandParensAndBraces,
  parseOperand,
  convertOperandToNumber,
  getLastTopLevelStatement,
} from "../interpreter_helpers";
import { splitTopLevelStatements } from "../parser";
import { evaluateFlatExpression } from "../evaluator";
import { Env, envHas, envGet } from "../runtime/env";
import type { InterpretFn } from "../runtime/types";

function expandGroupedExpressions(
  s: string,
  env: Env,
  interpret: InterpretFn
): string {
  const getLastTopLevelStatementLocal = (str: string) =>
    getLastTopLevelStatement(str, splitTopLevelStatements);

  return expandParensAndBraces(s, {
    env,
    interpret,
    getLastTopLevelStatement_fn: getLastTopLevelStatementLocal,
  });
}

function hasTopLevelSemicolon(str: string): boolean {
  return splitTopLevelStatements(str).length > 1;
}

function evaluateParenthesizedExpression(s: string, env: Env): number {
  let expr = s;
  const parenRegex = /\([^()]*\)/;
  while (true) {
    const match = expr.match(parenRegex);
    if (!match) break;
    const m = match[0];
    const idx = expr.indexOf(m);
    const before = idx > 0 ? expr[idx - 1] : undefined;
    // If the paren is immediately preceded by an identifier/number/closing paren/closing bracket,
    // it's likely a function call or indexing. Don't evaluate call argument lists as grouped
    // expressions here; leave them for the expression evaluator.
    if (before && /[A-Za-z0-9_)\]]/.test(before)) break;
    const inner = m.slice(1, -1);
    const v = evaluateFlatExpression(inner, env);
    expr = expr.replace(m, String(v));
  }
  return evaluateFlatExpression(expr, env);
}

function tryResolveBareIdentifier(s: string, env: Env): number {
  const idm = s.match(/^\s*([a-zA-Z_]\w*)\s*$/);
  if (idm) {
    const name = idm[1];
    if (envHas(env, name)) {
      const val = envGet(env, name);
      return convertOperandToNumber(val);
    }
  }
  return 0;
}

export function interpretExpression(
  s: string,
  env: Env,
  interpret: InterpretFn
): number {
  // If expression contains parentheses or braces, evaluate innermost grouped expressions first
  if (s.includes("(") || s.includes("{")) {
    s = expandGroupedExpressions(s, env, interpret);

    // After replacing groups, it's possible we introduced top-level semicolons
    // (e.g., "{ let x = 10; } x" -> "0; x"). In that case, re-run the block/sequence
    // handler by delegating to `interpret` again so declarations remain scoped.
    if (hasTopLevelSemicolon(s) || /^let\b/.test(s)) {
      return interpret(s, env);
    }
  }

  // Parse and evaluate expressions with '+' and '-' (left-associative)
  // We'll parse tokens: operand (operator operand)* and evaluate left to right.

  // If expression contains parentheses, evaluate innermost and replace
  if (s.includes("(")) {
    return evaluateParenthesizedExpression(s, env);
  }

  // If expression contains any operators (including logical/comparison), evaluate it as a flat expression
  if (/\|\||&&|<=|>=|==|!=|[+\-*/%<>]/.test(s)) {
    return evaluateFlatExpression(s, env);
  }

  // fallback: single operand parse
  const single = parseOperand(s);
  if (!single) {
    return tryResolveBareIdentifier(s, env);
  }
  return convertOperandToNumber(single);
}
