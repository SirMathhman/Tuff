import { createDeclarationParser } from "./declaration-parser";
import {
  extractArguments,
  checkMethodValidity,
} from "./transforms/helpers/method-call-helpers";
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
import { validateTypedArithmetic } from "./transforms/validation/type-arithmetic-validation";
import { transformStructInstantiation } from "./transforms/syntax/struct-transform";
import {
  transformModules,
  transformModuleAccess,
} from "./transforms/module-transforms";
import {
  collectModuleMetadata,
  validateModuleAccess,
} from "./transforms/helpers/module-validation";
import { transformPointers } from "./transforms/pointers/pointer-transforms";
import { findPointerTargets } from "./transforms/pointers/pointer-target-identification";
import { wrapPointerTargets } from "./transforms/pointers/wrap-pointer-targets";
import { isIdentifierChar, skipWhitespace } from "./parsing/string-helpers";
import { clearVariableTypes } from "./parsing/parser-utils";
import { validateFunctionCalls } from "./transforms/validation/function-call-validation";
import { validateStructInstantiation } from "./transforms/validation/struct-instantiation-validation";
import { validatePointerOperations } from "./transforms/validation/pointer-validation";
import { findReceiverStart, collectLocalVariables } from "./compiler-utils";
import { transformDestructorScopes } from "./transforms/destructors/destructor-scopes";
import type { VariableInfo } from "./declaration-parser-helpers";

const BUILTIN_METHODS = new Set(["charCodeAt", "length"]);

// Map Tuff properties to JS equivalents
const PROPERTY_ALIASES: Record<string, string> = {
  init: "length",
};

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
      let j = skipWhitespace(source, i);

      // Check for = {
      if (j < source.length && source.charAt(j) === "=") {
        j++;
        j = skipWhitespace(source, j);
        if (j < source.length && source.charAt(j) === "{") {
          moduleNames.add(name);
        }
      }
    }
    i++;
  }
  return moduleNames;
}

function handleMethodCallWithArgs(
  methodName: string,
  receiver: string,
  args: string,
  newResult: string,
  j: number,
): { newI: number; newResult: string } {
  const trimmedReceiver = receiver.trim();
  if (trimmedReceiver === "this" || trimmedReceiver === "thisVal") {
    return {
      newI: j - 1,
      newResult: newResult + methodName + "(" + args + ")",
    };
  }
  const combined =
    newResult +
    methodName +
    "(" +
    receiver +
    (args.trim() ? ", " + args : "") +
    ")";
  return { newI: j - 1, newResult: combined };
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
  while (j < len && isIdentifierChar(source.charAt(j))) {
    methodName += source.charAt(j);
    j++;
  }

  const methodCheck = checkMethodValidity(
    methodName,
    result,
    moduleNames,
    BUILTIN_METHODS,
    PROPERTY_ALIASES,
    findReceiverStart,
  );
  if (methodCheck?.type === "builtin" || localVars.has(methodName)) {
    return { newI: j - 1, newResult: result + "." + methodName };
  }
  if (methodCheck?.type === "alias") {
    return { newI: j - 1, newResult: result + "." + methodCheck.alias };
  }
  if (methodCheck?.type === "property") {
    return { newI: j - 1, newResult: result + "." + methodName };
  }

  while (j < len && source.charAt(j) === " ") j++;
  if (j < len && source.charAt(j) === "(") {
    const isClosing = result.charAt(result.length - 1) === ")";
    const receiverStart = findReceiverStart(result, isClosing);
    const receiver = result.slice(receiverStart);
    const newResult = result.slice(0, receiverStart);
    const { args, nextIdx } = extractArguments(source, j, len);
    return handleMethodCallWithArgs(
      methodName,
      receiver,
      args,
      newResult,
      nextIdx,
    );
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
      (isIdentifierChar(prevCh) || prevCh === ")")
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

function preparePointerHandling(
  source: string,
  variables: Map<string, VariableInfo>,
): {
  sourceWithWrappedPointers: string;
  pointerTargets: Set<string>;
  arrayVars: Set<string>;
} {
  validatePointerOperations(source, variables);
  const arrayVars = new Set<string>();
  for (const [name, info] of variables) {
    if (info.isArray) arrayVars.add(name);
  }
  const pointerTargets = findPointerTargets(source);
  let sourceWithWrappedPointers = source;
  if (pointerTargets.size > 0) {
    sourceWithWrappedPointers = wrapPointerTargets(
      source,
      pointerTargets,
      arrayVars,
    );
  }
  return { sourceWithWrappedPointers, pointerTargets, arrayVars };
}

function createTuffCompiler(source: string) {
  const variables: Map<string, VariableInfo> = new Map();
  return {
    compile(): string {
      clearVariableTypes();
      const parser = createDeclarationParser(source, variables);
      parser.parseDeclarations();
      validateFunctionCalls(source);
      validateStructInstantiation(source);
      const { sourceWithWrappedPointers, pointerTargets, arrayVars } =
        preparePointerHandling(source, variables);
      validateTypedArithmetic(sourceWithWrappedPointers);
      const moduleMetadata = collectModuleMetadata(sourceWithWrappedPointers);
      validateModuleAccess(sourceWithWrappedPointers, moduleMetadata);
      const withModules = transformModules(sourceWithWrappedPointers);
      const withStructs = transformStructInstantiation(withModules);
      const transformed = transformControlFlow(withStructs);
      const withDestructors = transformDestructorScopes(transformed);
      const js = removeTypeSyntax(withDestructors);
      const { expression, varDeclarations } = extractVarDeclarations(js);
      let expr = transformStringIndexing(expression, arrayVars);
      expr = transformCharLiterals(expr);
      expr = replaceBooleanLiterals(expr);
      expr = stripTypeAnnotationsAndValidate(expr);
      expr = transformModuleAccess(expr);
      expr = transformPointers(expr, pointerTargets);
      expr = transformMethodCalls(expr);
      expr = convertStatementsToExpressions(expr);
      const varDeclString =
        varDeclarations.length > 0 ? `var ${varDeclarations.join(", ")};` : "";
      return `(function() { ${varDeclString} return (${expr}); })()`;
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
