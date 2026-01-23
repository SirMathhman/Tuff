import { type CompileError } from "../types/types";
import { parseLetComponents } from "../support/let-binding";
import {
  extractFunctionDefinitions,
  getRemainningAfterFunctions,
} from "../support/function-context";

function collectFunctionVariables(source: string): {
  functionVars: Set<string>;
  remaining: string;
} {
  const functionVars = new Set<string>();
  let remaining = source;

  while (remaining.startsWith("let")) {
    const comp = parseLetComponents(remaining);
    if (!comp) break;

    const expr = comp.exprPart.trim();
    if (
      expr.startsWith("()") ||
      (expr.startsWith("(") && expr.includes("=>"))
    ) {
      functionVars.add(comp.varName);
    }

    remaining = comp.remaining;
  }

  return { functionVars, remaining };
}

function findFunctionVarInExpression(
  expr: string,
  functionVars: Set<string>,
): string | undefined {
  for (const funcVar of functionVars) {
    if (expr === funcVar) {
      return funcVar;
    }
  }
  return undefined;
}

function buildUncalledVarError(
  varName: string,
  len: number,
): CompileError {
  return {
    cause: `Function variable '${varName}' referenced without being called`,
    reason:
      "Functions must be called with parentheses. Function values cannot be used as expressions.",
    fix: `Change '${varName}' to '${varName}()' to call the function`,
    first: { line: 0, column: 0, length: len },
  };
}

function checkFunctionVarInExpressions(
  source: string,
  functionVars: Set<string>,
): CompileError | undefined {
  let remaining = source;

  while (remaining.startsWith("let")) {
    const comp = parseLetComponents(remaining);
    if (!comp) break;

    const expr = comp.exprPart.trim();
    const uncalledVar = findFunctionVarInExpression(expr, functionVars);
    if (uncalledVar) {
      return buildUncalledVarError(uncalledVar, source.length);
    }

    remaining = comp.remaining;
  }

  return undefined;
}

function checkFunctionVarInTrailing(
  remaining: string,
  functionVars: Set<string>,
): CompileError | undefined {
  const trimmed = remaining.trim();
  const uncalledVar = findFunctionVarInExpression(trimmed, functionVars);
  if (!uncalledVar) return undefined;
  return buildUncalledVarError(uncalledVar, trimmed.length);
}

function findNamedFunctionReference(
  functionContext: ReturnType<typeof extractFunctionDefinitions>,
  remainingAfterFunctions: string,
): CompileError | undefined {
  const trimmedRemaining = remainingAfterFunctions.trim();
  for (const func of functionContext) {
    if (trimmedRemaining === func.name) {
      return {
        cause: `Function '${func.name}' referenced without being called`,
        reason:
          "Functions must be called with parentheses. Functions cannot be used as values.",
        fix: `Change '${func.name}' to '${func.name}()' to call the function`,
        first: { line: 0, column: 0, length: remainingAfterFunctions.length },
      };
    }
  }
  return undefined;
}

export function detectUncalledFunctionReference(
  source: string,
): CompileError | undefined {
  // Check for direct fn function definitions
  const functionContext = extractFunctionDefinitions(source);
  if (functionContext.length > 0) {
    const remainingAfterFunctions = getRemainningAfterFunctions(source);
    const error = findNamedFunctionReference(
      functionContext,
      remainingAfterFunctions,
    );
    if (error) return error;
  }

  // Check for lambda functions assigned to variables
  const { functionVars, remaining } = collectFunctionVariables(source);

  // Check if function variables are used in let expressions
  const exprError = checkFunctionVarInExpressions(source, functionVars);
  if (exprError) return exprError;

  // Check if function variables are used in trailing expression
  return checkFunctionVarInTrailing(remaining, functionVars);
}
