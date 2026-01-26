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
} from "./transforms/syntax/literal-transforms";
import { transformStringIndexing } from "./transforms/syntax/string-transforms";
import { validateTypedArithmetic } from "./transforms/type-arithmetic-validation";
import { transformStructInstantiation } from "./transforms/syntax/struct-transform";
import { transformModules, transformModuleAccess } from "./transforms/module-transforms";
import {
  collectModuleMetadata,
  validateModuleAccess,
} from "./transforms/helpers/module-validation";
import { transformPointers } from "./transforms/pointer-transforms";
import { isWhitespace, isIdentifierChar } from "./parsing/string-helpers";
import { clearVariableTypes } from "./parsing/parser-utils";

function isAlphaNum(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

const BUILTIN_METHODS = new Set(["charCodeAt", "length"]);

// Map Tuff properties to JS equivalents
const PROPERTY_ALIASES: Record<string, string> = {
  init: "length", // Tuff's .init tracks initialized count, same as length for literals
};

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

/**
 * Collect module/object names by looking for patterns like "Name = {"
 */
function collectModuleNames(source: string): Set<string> {
  const moduleNames = new Set<string>();
  let i = 0;
  while (i < source.length) {
    // Look for identifier followed by = {
    if (
      isIdentifierChar(source.charAt(i)) &&
      (i === 0 || !isIdentifierChar(source.charAt(i - 1)))
    ) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source.charAt(i))) i++;
      const name = source.slice(nameStart, i);

      // Skip whitespace
      let j = i;
      while (j < source.length && isWhitespace(source.charAt(j))) j++;

      // Check for = {
      if (j < source.length && source.charAt(j) === "=") {
        j++;
        while (j < source.length && isWhitespace(source.charAt(j))) j++;
        if (j < source.length && source.charAt(j) === "{") {
          moduleNames.add(name);
        }
      }
    }
    i++;
  }
  return moduleNames;
}

function transformMethodCall(
  source: string,
  i: number,
  result: string,
  localVars: Set<string>,
  moduleNames: Set<string>,
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

  // Check for property aliases (like .init -> .length)
  if (PROPERTY_ALIASES[methodName]) {
    return {
      newI: j - 1,
      newResult: result + "." + PROPERTY_ALIASES[methodName],
    };
  }

  // Check if receiver is a module/object - if so, keep dot access
  const isClosingResult = result.charAt(result.length - 1) === ")";
  const receiverStartCheck = findReceiverStart(result, isClosingResult);
  const receiverCheck = result.slice(receiverStartCheck).trim();
  if (moduleNames.has(receiverCheck)) {
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

    // Special case: if receiver is "this" or "thisVal", just call the method directly
    // without passing anything as first arg (global scope function call)
    const trimmedReceiver = receiver.trim();
    if (trimmedReceiver === "this" || trimmedReceiver === "thisVal") {
      const transformed = newResult + methodName + "(" + args + ")";
      return { newI: j - 1, newResult: transformed };
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
  const moduleNames = collectModuleNames(source);
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
        moduleNames,
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
  isArray?: boolean;
  isUninitialized?: boolean;
}

/**
 * Factory function to create a Tuff compiler
 */
function createTuffCompiler(source: string) {
  const variables: Map<string, VariableInfo> = new Map();

  return {
    compile(): string {
      // Reset variable type tracking for each compilation
      clearVariableTypes();

      // Pass 1: Parse variable declarations
      const parser = createDeclarationParser(source, variables);
      parser.parseDeclarations();

      // Build set of array variable names
      const arrayVars = new Set<string>();
      for (const [name, info] of variables) {
        if (info.isArray) arrayVars.add(name);
      }

      // Validate typed arithmetic operations before removing type syntax
      validateTypedArithmetic(source);

      const moduleMetadata = collectModuleMetadata(source);
      validateModuleAccess(source, moduleMetadata);

      // Pass 2: Transform modules and objects FIRST
      const withModules = transformModules(source);

      // Pass 3: Transform struct instantiation BEFORE removing braces
      // (struct instantiation braces must not be stripped)
      const withStructs = transformStructInstantiation(withModules);

      // Pass 4: Transform control flow BEFORE removing braces
      // (if/else/loop/while/for/match need their braces)
      const transformed = transformControlFlow(withStructs);

      // Pass 5: Strip Tuff syntax (let, mut, type annotations, struct declarations)
      const js = removeTypeSyntax(transformed);

      // Pass 6: Extract variables that need declaration
      const { expression, varDeclarations } = extractVarDeclarations(js);

      // Pass 7: Transform literals
      let transformedExpr = transformStringIndexing(expression, arrayVars);
      transformedExpr = transformCharLiterals(transformedExpr);
      transformedExpr = replaceBooleanLiterals(transformedExpr);
      transformedExpr = stripTypeAnnotationsAndValidate(transformedExpr);

      // Transform :: to . for module access
      transformedExpr = transformModuleAccess(transformedExpr);

      // Transform pointer operations (&x, *y)
      transformedExpr = transformPointers(transformedExpr);

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
