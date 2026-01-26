import {
  getCompileFunctionDefs,
  type CompileFunctionDef,
} from "../../function-defs-storage";
import { isWhitespace, isIdentifierChar } from "../../parsing/string-helpers";
import {
  validateGenericTypeConsistency,
  getConcreteType,
} from "../../../utils/generics/generic-validation";
import { isTypeCompatible } from "../type-compatibility";

/**
 * Validate generic type consistency for a function call
 * Maps generic type parameters to concrete types and ensures consistency
 */
function validateGenericTypeConsistencyForCall(
  fnDefData: CompileFunctionDef,
  args: string[],
): void {
  if (!fnDefData.generics || fnDefData.generics.length === 0) {
    return; // Not a generic function
  }

  const { params, generics } = fnDefData;
  const typeMapping = new Map<string, string>(); // Maps generic param (e.g., "T") to concrete type

  // Build type mapping from arguments
  for (let i = 0; i < args.length && i < params.length; i++) {
    const arg = args[i]!.trim();
    const param = params[i]!;
    const paramType = param.type;

    // Check if parameter type is a generic parameter
    if (generics.includes(paramType)) {
      const concreteType = getConcreteType(arg);
      validateGenericTypeConsistency(typeMapping, paramType, concreteType);
    }
  }
}

/**
 * Validate a single function call for argument type compatibility
 */
function validateFunctionCall(
  fnName: string,
  argsStr: string,
  functionDefs: Map<string, CompileFunctionDef>,
): void {
  const fnDefData = functionDefs.get(fnName);
  if (!fnDefData) {
    return; // No function definition to validate against
  }

  const params = fnDefData.params;
  if (params.length === 0) {
    return; // No parameter info to validate
  }

  // Parse the arguments
  const args = parseArguments(argsStr);

  // Check for argument count mismatch
  if (args.length !== params.length) {
    // Allow for method calls where first arg is 'this'
    if (args.length === params.length - 1) {
      // This might be a method call, skip validation for now
      return;
    }

    // If counts don't match, skip validation for now
    // (in case of variable arguments or other special cases)
    return;
  }

  // Validate generic type consistency
  validateGenericTypeConsistencyForCall(fnDefData, args);

  // Validate each argument against its parameter type
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!.trim();
    const param = params[i]!;

    // Don't validate variable references, parameter names, or identifiers
    if (isVariableReference(arg)) {
      continue;
    }

    // Skip validation for function types (indicated by => in the type)
    if (param.type.includes("=>")) {
      continue;
    }

    // Skip generic type parameters - they're handled above
    if (fnDefData.generics && fnDefData.generics.includes(param.type)) {
      continue;
    }

    // Check type compatibility
    if (!isTypeCompatible(arg, param.type)) {
      throw new Error(
        `Function '${fnName}' parameter '${param.name}' expects type ${param.type}, but got ${arg}`,
      );
    }
  }
}

/**
 * Check if a value looks like a variable reference or parameter name
 */
function isVariableReference(value: string): boolean {
  const trimmed = value.trim();
  // Simple heuristic: if it's a single identifier, it's likely a variable
  if (trimmed.length === 0) return false;

  const firstChar = trimmed[0]!;
  // Identifiers must start with a letter or underscore, not a digit
  if (
    !(
      (firstChar >= "a" && firstChar <= "z") ||
      (firstChar >= "A" && firstChar <= "Z") ||
      firstChar === "_"
    )
  ) {
    return false;
  }

  // Check if entire string is identifier characters
  for (let i = 0; i < trimmed.length; i++) {
    if (!isIdentifierChar(trimmed[i])) {
      return false; // Contains non-identifier chars, not a simple variable
    }
  }
  return true;
}

/**
 * Simple argument parser - splits by commas at the top level
 */
function parseArguments(argsStr: string): string[] {
  if (!argsStr.trim()) {
    return [];
  }

  const args: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === "(") {
      parenDepth++;
      current += ch;
    } else if (ch === ")") {
      parenDepth--;
      current += ch;
    } else if (ch === "[") {
      bracketDepth++;
      current += ch;
    } else if (ch === "]") {
      bracketDepth--;
      current += ch;
    } else if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Check if position is at start of function declaration and skip it
 */
function trySkipFnDeclaration(source: string, i: number): number | undefined {
  if (source.slice(i, i + 2) !== "fn") return undefined;
  const isWhitespaceAfter =
    i + 2 < source.length ? isWhitespace(source[i + 2]) : false;
  if (!isWhitespaceAfter) return undefined;
  let pos = i;
  while (pos < source.length && source[pos] !== ";") pos++;
  return pos + 1; // Skip the semicolon
}

/**
 * Validate all function calls in the source code
 */
export function validateFunctionCalls(source: string): void {
  const functionDefs = getCompileFunctionDefs();
  if (functionDefs.size === 0) {
    return; // No function definitions to validate against
  }

  // Find all function calls and validate them
  let i = 0;
  while (i < source.length) {
    const skipped = trySkipFnDeclaration(source, i);
    if (skipped !== undefined) {
      i = skipped;
      continue;
    }

    // Look for identifier followed by (
    if (isIdentifierChar(source[i]!)) {
      const idStart = i;
      while (i < source.length && isIdentifierChar(source[i]!)) {
        i++;
      }
      const fnName = source.slice(idStart, i);

      // Skip whitespace
      let j = i;
      while (j < source.length && isWhitespace(source[j]!)) {
        j++;
      }

      // Check for opening paren (function call)
      if (j < source.length && source[j] === "(") {
        // This looks like a function call
        if (functionDefs.has(fnName)) {
          j++; // Skip opening paren
          let parenDepth = 1;
          const argsStart = j;
          while (j < source.length && parenDepth > 0) {
            if (source[j] === "(") {
              parenDepth++;
            } else if (source[j] === ")") {
              parenDepth--;
            }
            j++;
          }

          const argsStr = source.slice(argsStart, j - 1); // Exclude closing paren
          validateFunctionCall(fnName, argsStr, functionDefs);
        }
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
}
