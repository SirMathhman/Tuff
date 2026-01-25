import { createDeclarationParser } from "./declaration-parser";
import {
  removeTypeSyntax,
  extractVarDeclarations,
  transformControlFlow,
} from "./transforms/syntax-transforms";
import {
  replaceBooleanLiterals,
  stripTypeAnnotationsAndValidate,
  convertStatementsToExpressions,
  transformCharLiterals,
} from "./transforms/literal-transforms";
import { transformStringIndexing } from "./transforms/string-transforms";
import { validateTypedArithmetic } from "./transforms/type-arithmetic-validation";
import { isWhitespace, isIdentifierChar } from "./parsing/string-helpers";

function isAlphaNum(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

const BUILTIN_METHODS = new Set(["charCodeAt", "length", "init"]);

function findReceiverStart(result: string, isClosingParen: boolean): number {
  let receiverStart = result.length - 1;
  if (isClosingParen) {
    let depth = 1;
    receiverStart--;
    while (receiverStart >= 0 && depth > 0) {
      const c = result.charAt(receiverStart);
      if (c === ")") depth++;
      else if (c === "(") depth--;
      receiverStart--;
    }
    receiverStart++; // Move to the (
    while (receiverStart > 0 && isAlphaNum(result.charAt(receiverStart - 1)))
      receiverStart--;
  } else {
    while (receiverStart > 0) {
      const charLeft = result.charAt(receiverStart - 1);
      if (
        charLeft === "." ||
        (charLeft >= "0" && charLeft <= "9") ||
        isAlphaNum(charLeft)
      ) {
        receiverStart--;
      } else {
        break;
      }
    }
  }
  return receiverStart;
}

/**
 * Simple method call transformer: 100.add(50) => add(100, 50)
 * Skips built-in methods like charCodeAt, length, init
 */
function collectLocalVariables(source: string): Set<string> {
  const localVars = new Set<string>();
  let braceDepth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      braceDepth--;
    } else if (braceDepth > 0 && source.slice(i, i + 5) === "const") {
      let j = i + 5;
      while (j < source.length && isWhitespace(source.charAt(j))) j++;
      const nameStart = j;
      while (j < source.length && isIdentifierChar(source.charAt(j))) j++;
      if (j > nameStart) {
        localVars.add(source.slice(nameStart, j));
      }
    }
  }
  return localVars;
}

function transformMethodCall(
  source: string,
  i: number,
  result: string,
  localVars: Set<string>,
): { newI: number; newResult: string } {
  let methodName = "";
  let j = i + 1;
  const len = source.length;
  while (j < len && isAlphaNum(source.charAt(j))) {
    methodName += source.charAt(j);
    j++;
  }

  if (BUILTIN_METHODS.has(methodName) || localVars.has(methodName)) {
    return { newI: j - 1, newResult: result + "." + methodName };
  }

  while (j < len && source.charAt(j) === " ") j++;
  if (j < len && source.charAt(j) === "(") {
    const isClosing = result.charAt(result.length - 1) === ")";
    const receiverStart = findReceiverStart(result, isClosing);
    const receiver = result.slice(receiverStart);
    const newResult = result.slice(0, receiverStart);
    j++;
    let args = "";
    let depth = 1;
    while (j < len && depth > 0) {
      const c = source.charAt(j);
      if (c === "(") depth++;
      else if (c === ")") depth--;
      if (depth > 0) args += c;
      j++;
    }
    const transformed =
      newResult +
      methodName +
      "(" +
      receiver +
      (args.trim() ? ", " + args : "") +
      ")";
    return { newI: j - 1, newResult: transformed };
  }
  return { newI: j - 1, newResult: result + "." + methodName };
}

function transformMethodCalls(source: string): string {
  const localVars = collectLocalVariables(source);
  let result = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source.charAt(i);
    const prevCh = i > 0 ? source.charAt(i - 1) : "";
    if (
      ch === "." &&
      result.length > 0 &&
      (isAlphaNum(prevCh) || prevCh === "0" || prevCh === ")")
    ) {
      const { newI, newResult } = transformMethodCall(
        source,
        i,
        result,
        localVars,
      );
      result = newResult;
      i = newI + 1;
    } else {
      result += source.charAt(i);
      i++;
    }
  }
  return result;
}

interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
}

/**
 * Factory function to create a Tuff compiler
 */
function createTuffCompiler(source: string) {
  const variables: Map<string, VariableInfo> = new Map();

  return {
    compile(): string {
      // Pass 1: Parse variable declarations
      const parser = createDeclarationParser(source, variables);
      parser.parseDeclarations();

      // Validate typed arithmetic operations before removing type syntax
      validateTypedArithmetic(source);

      // Pass 2: Transform control flow BEFORE removing braces
      // (if/else/loop/while/for/match need their braces)
      const transformed = transformControlFlow(source);

      // Pass 3: Strip Tuff syntax (let, mut, type annotations)
      const js = removeTypeSyntax(transformed);

      // Pass 4: Extract variables that need declaration
      const { expression, varDeclarations } = extractVarDeclarations(js);

      // Pass 5: Transform literals
      let transformedExpr = transformStringIndexing(expression);
      transformedExpr = transformCharLiterals(transformedExpr);
      transformedExpr = replaceBooleanLiterals(transformedExpr);
      transformedExpr = stripTypeAnnotationsAndValidate(transformedExpr);

      // Transform method calls: 100.add(50) => add(100, 50)
      transformedExpr = transformMethodCalls(transformedExpr);

      // Convert semicolons to commas for eval (statements to expressions)
      transformedExpr = convertStatementsToExpressions(transformedExpr);

      // Wrap in a function with var declarations
      const varDeclString =
        varDeclarations.length > 0 ? `var ${varDeclarations.join(", ")};` : "";

      return `(function() { ${varDeclString} return (${transformedExpr}); })()`;
    },
  };
}

/**
 * Compile Tuff source code to JavaScript string
 * @param _source Tuff source code
 * @returns JavaScript code as a string
 */
export function compile(_source: string): string {
  const source = _source.trim();

  // Empty source compiles to empty script
  if (!source) {
    return "";
  }

  // Parse and compile the source
  const compiler = createTuffCompiler(source);
  return compiler.compile();
}

/**
 * Execute Tuff source code by compiling and evaluating
 * @param source Tuff source code
 * @returns The numeric result of execution
 */
export function execute(source: string): number {
  return evalImpl(compile(source));
}

export function evalImpl(js: string) {
  const result = eval(js);
  if (typeof result === "boolean") {
    return result ? 1 : 0;
  }
  return typeof result === "number" ? result : 0;
}
