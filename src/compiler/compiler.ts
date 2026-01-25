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
function transformMethodCalls(source: string): string {
  let result = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source.charAt(i);
    const prevCh = i > 0 ? source.charAt(i - 1) : "";
    if (
      ch === "." &&
      result.length > 0 &&
      (prevCh === "0" || prevCh === ")" || isAlphaNum(prevCh))
    ) {
      i++; // Skip dot
      let methodName = "";
      while (i < len && isAlphaNum(source.charAt(i))) {
        methodName += source.charAt(i);
        i++;
      }

      // Skip built-in methods that should not be transformed
      if (BUILTIN_METHODS.has(methodName)) {
        result += "." + methodName;
        continue;
      }

      while (i < len && source.charAt(i) === " ") i++;
      if (i < len && source.charAt(i) === "(") {
        const receiverStart = findReceiverStart(
          result,
          result.charAt(result.length - 1) === ")",
        );
        const receiver = result.slice(receiverStart);
        result = result.slice(0, receiverStart);
        i++;
        let args = "";
        let depth = 1;
        while (i < len && depth > 0) {
          const c = source.charAt(i);
          if (c === "(") depth++;
          else if (c === ")") depth--;
          if (depth > 0) args += c;
          i++;
        }
        result +=
          methodName + "(" + receiver + (args.trim() ? ", " + args : "") + ")";
        continue;
      }
    }
    result += source.charAt(i);
    i++;
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
