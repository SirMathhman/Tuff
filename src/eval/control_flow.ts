/**
 * Control flow expression handlers for if, match, and inline fn expressions.
 * Extracted from eval.ts to comply with max-lines ESLint rule.
 */
import { splitTopLevelStatements } from "../parser";
import { parseFnComponents, findMatchingParen } from "../interpret_helpers";
import { Env, envClone, envSet } from "../env";
import {
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  type RuntimeValue,
} from "../types";
import { applyBinaryOp } from "./operators";

interface FunctionObject {
  params: RuntimeValue;
  body: string;
  isBlock: boolean;
  resultAnnotation: string | undefined;
  closureEnv: Env | undefined;
}

interface FunctionWrapper {
  fn: FunctionObject;
}

// Type for the evaluateReturningOperand function to avoid circular imports
type EvaluateFn = (exprStr: string, localEnv: Env) => RuntimeValue;

interface MatchTargetAndRest {
  targetExpr: string;
  rest: string;
}

function parseMatchTargetAndRest(sTrim: string): MatchTargetAndRest {
  const afterMatch = sTrim.slice("match".length).trimStart();
  if (afterMatch.startsWith("(")) {
    const startParen = sTrim.indexOf("(", 0);
    const endParen = findMatchingParen(sTrim, {
      start: startParen,
      open: "(",
      close: ")",
    });
    if (endParen === -1) throw new Error("unbalanced parentheses in match");
    const targetExpr = sTrim.slice(startParen + 1, endParen).trim();
    const rest = sTrim.slice(endParen + 1).trimStart();
    return { targetExpr, rest };
  }

  const braceIdx = afterMatch.indexOf("{");
  if (braceIdx === -1) throw new Error("invalid match syntax");
  const targetExpr = afterMatch.slice(0, braceIdx).trim();
  const rest = afterMatch.slice(braceIdx).trimStart();
  return { targetExpr, rest };
}

function extractMatchParts(sTrim: string, targetExpr: string, rest: string) {
  if (!rest.startsWith("{")) throw new Error("invalid match block");
  const startBrace = sTrim.indexOf(
    "{",
    sTrim.indexOf(targetExpr) + (targetExpr.length || 0)
  );
  const endBrace = findMatchingParen(sTrim, {
    start: startBrace,
    open: "{",
    close: "}",
  });
  if (endBrace === -1) throw new Error("unbalanced braces in match");
  const inner = sTrim.slice(startBrace + 1, endBrace);
  return splitTopLevelStatements(inner)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Check if a condition value is truthy
 */
function isCondTruthy(condVal: unknown): boolean {
  if (isBoolOperand(condVal)) return condVal.boolValue;
  if (isIntOperand(condVal)) return condVal.valueBig !== 0n;
  if (typeof condVal === "number") return condVal !== 0;
  if (isFloatOperand(condVal)) return condVal.floatValue !== 0;
  return false;
}

/**
 * Handle if expressions: if (condition) trueBranch else falseBranch
 */
export function handleIfExpression(
  sTrim: string,
  localEnv: Env,
  evaluate: EvaluateFn
): RuntimeValue {
  const condStart = sTrim.indexOf("(");
  if (condStart === -1) throw new Error("invalid if syntax: missing (");
  const condEnd = findMatchingParen(sTrim, {
    start: condStart,
    open: "(",
    close: ")",
  });
  if (condEnd === -1)
    throw new Error("invalid if syntax: unbalanced parentheses");
  const condStr = sTrim.slice(condStart + 1, condEnd).trim();
  const condVal = evaluate(condStr, localEnv);
  const isTruthy = isCondTruthy(condVal);

  // rest after condition
  let rest = sTrim.slice(condEnd + 1).trim();
  // else could be preceded by braced trueBranch
  let trueBranch = "";
  let falseBranch = "";

  if (rest.startsWith("{")) {
    const bEnd = findMatchingParen(sTrim, {
      start: sTrim.indexOf(rest),
      open: "{",
      close: "}",
    });
    if (bEnd === -1) throw new Error("unbalanced braces in if");
    trueBranch = sTrim.slice(sTrim.indexOf(rest), bEnd + 1);
    rest = sTrim.slice(bEnd + 1).trim();
  } else {
    // find the else keyword
    const elseIdx = rest.indexOf(" else ");
    if (elseIdx === -1) throw new Error("if without else");
    trueBranch = rest.slice(0, elseIdx).trim();
    rest = rest.slice(elseIdx + 6).trim(); // " else "
  }

  falseBranch = rest;
  if (!falseBranch) throw new Error("missing else branch");

  return evaluate(isTruthy ? trueBranch : falseBranch, localEnv);
}

/**
 * Handle match expressions: match (<expr>) { case <pat> => <expr>; ... default => <expr>; }
 */
export function handleMatchExpression(
  sTrim: string,
  localEnv: Env,
  evaluate: EvaluateFn
): RuntimeValue {
  const { targetExpr, rest } = parseMatchTargetAndRest(sTrim);
  const targetOp = evaluate(targetExpr, localEnv);
  const parts = extractMatchParts(sTrim, targetExpr, rest);

  let defaultBody: string | undefined = undefined;
  for (const part of parts) {
    const caseMatch = part.match(/^case\s+([\s\S]+?)\s*=>\s*([\s\S]*)$/);
    if (caseMatch) {
      const patStr = caseMatch[1].trim();
      const bodyStr = caseMatch[2].trim();
      const patOp = evaluate(patStr, localEnv);
      const eq = applyBinaryOp("==", targetOp, patOp);
      if (isBoolOperand(eq) && eq.boolValue) {
        return evaluate(bodyStr, localEnv);
      } // no match -> continue to next case
      continue;
    }
    const defMatch = part.match(/^default\s*=>\s*([\s\S]*)$/);
    if (defMatch) {
      defaultBody = defMatch[1].trim();
      continue;
    }
    throw new Error("invalid match case");
  }
  if (defaultBody !== undefined) {
    return evaluate(defaultBody, localEnv);
  }
  return { valueBig: 0n };
}

/**
 * Handle inline function expressions: fn name(...) => ... or fn name(...) { ... }
 */
export function handleFnExpression(
  sTrim: string,
  localEnv: Env
): FunctionWrapper {
  const parsed = parseFnComponents(sTrim);
  const { name, params, body, isBlock, resultAnnotation } = parsed;
  const fnObj: FunctionObject = {
    params,
    body,
    isBlock,
    resultAnnotation,
    closureEnv: undefined,
  };
  const wrapper: FunctionWrapper = { fn: fnObj };
  fnObj.closureEnv = envClone(localEnv);
  // expose named binding inside closure for recursion
  envSet(fnObj.closureEnv, name, wrapper);
  return wrapper;
}
