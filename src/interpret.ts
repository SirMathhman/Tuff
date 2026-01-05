import { Result, ok, err } from "./result";
import { evaluateArithmetic, reduceParentheses } from "./arithmetic";
import { evalLetBinding } from "./bindings";
import { parseTopLevelStatements, evalProgram } from "./program";
import { checkDuplicateStructs, handleStructDeclaration } from "./structs";
import { findMatchingBrace } from "./utils";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Let-binding: let name [: Type] = init; body
  if (trimmed.startsWith("let ")) {
    return evalLetBinding(trimmed);
  }

  const blockRes = tryEvalBlock(trimmed);
  if (blockRes) return blockRes;

  const programRes = tryEvalProgram(input);
  if (programRes) return programRes;

  const dupStructs = checkDuplicateStructs(trimmed);
  if (!dupStructs.ok) return err(dupStructs.error);

  const structHandled = handleStructDeclaration(trimmed);
  if (structHandled) return structHandled;

  let currentExpr = trimmed;
  // Reduce parentheses first (evaluate innermost parentheses recursively)
  if (currentExpr.includes("(")) {
    const reduced = reduceParentheses(currentExpr);
    if (!reduced.ok) return err(reduced.error);
    currentExpr = reduced.value;
  }

  // Boolean literal support
  if (currentExpr.toLowerCase() === "true") return ok(1);
  if (currentExpr.toLowerCase() === "false") return ok(0);

  // Direct numeric literal
  const n = Number(currentExpr);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Simple arithmetic chains with +, -, *, / (no parentheses).
  // Evaluate * and / first (left-to-right), then + and - left-to-right.
  const arithChainRe =
    /^\s*[+\-]?\d+(?:\.\d+)?(?:\s*[+\-*/]\s*[+\-]?\d+(?:\.\d+)?)*\s*$/;
  if (arithChainRe.test(currentExpr)) {
    return evaluateArithmetic(currentExpr);
  }

  return err("Err");
}

function tryEvalProgram(input: string): Result<number, string> | undefined {
  const topStmts = parseTopLevelStatements(input);
  if (topStmts && topStmts.length > 1) return evalProgram(topStmts);
  return undefined;
}

function tryEvalBlock(trimmed: string): Result<number, string> | undefined {
  if (!trimmed.startsWith("{")) return undefined;
  const closeIdx = findMatchingBrace(trimmed, 0);
  if (closeIdx === -1) return err("Mismatched braces");
  const inner = trimmed.slice(1, closeIdx).trim();
  if (inner.length === 0) return err("Empty block");
  const evalRes = interpret(inner);
  if (!evalRes.ok) return err(evalRes.error);
  // If there's trailing code after the block, evaluate it next (block-local bindings shouldn't leak)
  const rest = trimmed.slice(closeIdx + 1).trim();
  if (rest.length === 0) return evalRes;
  return interpret(rest);
}
