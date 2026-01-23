import { type CompileError } from "../types/types";
import { parseLetComponents } from "../support/let-binding";
import {
  extractFunctionDefinitions,
  getRemainningAfterFunctions,
} from "../support/function-context";

function processLetBindings(
  source: string,
  processor: (expr: string, varName: string) => void,
): string {
  let remaining = source;

  while (remaining.startsWith("let")) {
    const comp = parseLetComponents(remaining);
    if (!comp) break;

    processor(comp.exprPart.trim(), comp.varName);
    remaining = comp.remaining;
  }

  return remaining;
}

function collectFunctionVariables(source: string): {
  functionVars: Set<string>;
  remaining: string;
} {
  const functionVars = new Set<string>();

  const remaining = processLetBindings(source, (expr, varName) => {
    if (
      expr.startsWith("()") ||
      (expr.startsWith("(") && expr.includes("=>"))
    ) {
      functionVars.add(varName);
    }
  });

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

function buildUncalledVarError(varName: string, len: number): CompileError {
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

function extractIdentifierAt(
  source: string,
  startPos: number,
): {
  name: string;
  endPos: number;
} {
  let name = "";
  let pos = startPos;
  const firstChar = source[pos];
  if (!firstChar || !isIdentifierChar(firstChar, true)) {
    return { name: "", endPos: startPos };
  }

  while (pos < source.length) {
    const c = source[pos];
    if (!c || !isIdentifierChar(c, false)) break;
    name += c;
    pos++;
  }

  return { name, endPos: pos };
}

function extractFunctionCalls(source: string): string[] {
  const calls: string[] = [];
  let i = 0;
  while (i < source.length) {
    const { name, endPos } = extractIdentifierAt(source, i);

    if (name.length > 0 && endPos < source.length && source[endPos] === "(") {
      calls.push(name);
      i = endPos + 1;
    } else {
      i = endPos > i ? endPos : i + 1;
    }
  }
  return calls;
}

function isIdentifierChar(char: string, isFirst: boolean): boolean {
  const isLetter = (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
  const isDigit = char >= "0" && char <= "9";
  const isUnderscore = char === "_";

  if (isFirst) {
    return isLetter || isUnderscore;
  }
  return isLetter || isDigit || isUnderscore;
}

function isFunctionDefinitionExpression(expr: string): boolean {
  return (
    expr.startsWith("fn ") || // named function
    expr.startsWith("()") || // lambda
    (expr.startsWith("(") && expr.includes("=>"))
  );
}

function collectNonFunctionVariables(source: string): Set<string> {
  const nonFunctionVars = new Set<string>();

  processLetBindings(source, (expr, varName) => {
    const isFuncDef = isFunctionDefinitionExpression(expr);
    const couldBeFunc = isFuncDef || expr.startsWith("if");

    if (!couldBeFunc) {
      nonFunctionVars.add(varName);
    }
  });

  return nonFunctionVars;
}

function checkNonFunctionCalls(
  source: string,
  nonFunctionVars: Set<string>,
): CompileError | undefined {
  const calls = extractFunctionCalls(source);
  for (const call of calls) {
    if (nonFunctionVars.has(call)) {
      return {
        cause: `Cannot call non-function variable '${call}'`,
        reason: `Variable '${call}' is not a function and cannot be called`,
        fix: `Remove the parentheses or assign a function to '${call}'`,
        first: { line: 0, column: 0, length: source.length },
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
  const uncalledError = checkFunctionVarInTrailing(remaining, functionVars);
  if (uncalledError) return uncalledError;

  // Check if non-function variables are being called
  const nonFunctionVars = collectNonFunctionVariables(source);
  return checkNonFunctionCalls(source, nonFunctionVars);
}
