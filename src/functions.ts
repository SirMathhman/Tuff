import type { Interpreter } from "./expressions/handlers";
import { extractTypeSize } from "./type-utils";
import { makeDeclarationHandler } from "./declarations";
import { isValidIdentifier } from "./utils/identifier-utils";

// Store function definitions: name => { params: [(name, type)], returnType, body }
const functionDefs = new Map<
  string,
  {
    params: Array<{ name: string; type: number }>;
    returnType: number;
    body: string;
  }
>();

// Store function references: varName => fnName
const functionRefs = new Map<string, string>();

export function setFunctionRef(varName: string, fnName: string): void {
  functionRefs.set(varName, fnName);
}

export function getFunctionRef(varName: string): string | undefined {
  return functionRefs.get(varName);
}

export function isFunctionType(typeStr: string): boolean {
  // Check if type string matches function type pattern: () => ReturnType
  const trimmed = typeStr.trim();
  return (
    trimmed.startsWith("(") &&
    trimmed.includes("=>") &&
    trimmed.lastIndexOf(")") < trimmed.indexOf("=>")
  );
}

export function trySetFunctionRef(
  varName: string,
  exprStr: string,
): boolean {
  // Returns true if this was a function type, false otherwise
  if (!exprStr) return false;
  setFunctionRef(varName, exprStr);
  return true;
}

export const handleFunctionDeclaration = makeDeclarationHandler(
  "fn",
  (rest: string) => {
    // Find the => arrow
    const arrowIndex = rest.indexOf("=>");
    return arrowIndex !== -1 ? rest.indexOf(";", arrowIndex) : -1;
  },
  (rest: string, closeIndex: number, typeMap: Map<string, number>) => {
    // Parse: fn name(param1 : Type1, param2 : Type2) : ReturnType => body;
    const parenStart = rest.indexOf("(");
    if (parenStart === -1) return;

    const fnName = rest.slice(0, parenStart).trim();
    if (!isValidIdentifier(fnName)) return;

    const parenEnd = rest.indexOf(")");
    if (parenEnd === -1) return;

    // Parse parameters
    const paramsStr = rest.slice(parenStart + 1, parenEnd).trim();
    const params: Array<{ name: string; type: number }> = [];

    if (paramsStr) {
      const paramParts = paramsStr.split(",");
      for (const param of paramParts) {
        const colonIndex = param.indexOf(":");
        if (colonIndex === -1) return;

        const paramName = param.slice(0, colonIndex).trim();
        const paramTypeStr = param.slice(colonIndex + 1).trim();

        if (!isValidIdentifier(paramName)) return;

        let paramType = extractTypeSize(paramTypeStr);
        if (paramType === 0 && typeMap.has("__alias__" + paramTypeStr)) {
          paramType = typeMap.get("__alias__" + paramTypeStr) || 0;
        }

        if (paramType === 0) return;

        params.push({ name: paramName, type: paramType });
      }
    }

    // Find return type
    const arrowIndex = rest.indexOf("=>");
    if (arrowIndex === -1) return;

    const returnTypeStr = rest.slice(parenEnd + 1, arrowIndex).trim();
    if (!returnTypeStr.startsWith(":")) return;

    const returnTypeNameStr = returnTypeStr.slice(1).trim();
    let returnType = extractTypeSize(returnTypeNameStr);
    if (returnType === 0 && typeMap.has("__alias__" + returnTypeNameStr)) {
      returnType = typeMap.get("__alias__" + returnTypeNameStr) || 0;
    }

    if (returnType === 0) return;

    // Parse body
    const bodyStart = arrowIndex + 2;
    const body = rest.slice(bodyStart, closeIndex).trim();

    // Store the function definition
    functionDefs.set(fnName, {
      params,
      returnType,
      body,
    });
  },
);

export function parseFunctionCall(
  s: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number | undefined {
  const trimmed = s.trim();

  // Check if this looks like a function call: identifier(args)
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex === -1) {
    return undefined;
  }

  const fnName = trimmed.slice(0, parenIndex).trim();
  if (!isValidIdentifier(fnName)) {
    return undefined;
  }

  // Check if fnName is a function reference (variable pointing to a function)
  const referencedFnName = getFunctionRef(fnName);
  const actualFnName = referencedFnName || fnName;

  if (!functionDefs.has(actualFnName)) {
    return undefined;
  }

  // Find matching closing paren
  let parenDepth = 0;
  let closeParenIndex = -1;
  for (let i = parenIndex; i < trimmed.length; i++) {
    if (trimmed[i] === "(") parenDepth++;
    else if (trimmed[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        closeParenIndex = i;
        break;
      }
    }
  }

  if (closeParenIndex === -1) {
    return undefined;
  }

  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();
  const fnDef = functionDefs.get(actualFnName)!;

  // Parse arguments
  const args: number[] = [];
  if (argsStr) {
    // Split by comma, but respect nested parens and braces
    const argParts: string[] = [];
    let current = "";
    let parenD = 0;
    let braceD = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (ch === "(") parenD++;
      else if (ch === ")") parenD--;
      else if (ch === "{") braceD++;
      else if (ch === "}") braceD--;
      else if (ch === "," && parenD === 0 && braceD === 0) {
        argParts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) {
      argParts.push(current.trim());
    }

    if (argParts.length !== fnDef.params.length) {
      throw new Error(
        `function ${actualFnName} expects ${fnDef.params.length} arguments, got ${argParts.length}`,
      );
    }

    for (const argStr of argParts) {
      const argValue = interpreter(
        argStr,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      );
      args.push(argValue);
    }
  } else if (fnDef.params.length !== 0) {
    throw new Error(
      `function ${actualFnName} expects ${fnDef.params.length} arguments, got 0`,
    );
  }

  // Create new scope for function execution
  const fnScope = new Map<string, boolean>(mutMap);
  const fnVarMap = new Map<string, number>();

  // Bind parameters to arguments
  for (let i = 0; i < fnDef.params.length; i++) {
    const paramName = fnDef.params[i]?.name;
    const paramValue = args[i];
    if (paramName && paramValue !== undefined) {
      fnVarMap.set(paramName, paramValue);
      fnScope.set(paramName, false); // parameters are immutable
    }
  }

  // Merge with current scope (parameters override)
  const mergedScope = new Map(scope);
  for (const [k, v] of fnVarMap) {
    mergedScope.set(k, v);
  }

  // Execute function body
  const result = interpreter(
    fnDef.body,
    mergedScope,
    typeMap,
    fnScope,
    uninitializedSet,
    unmutUninitializedSet,
  );

  return result;
}

export function isFunctionDefined(name: string): boolean {
  return functionDefs.has(name);
}

export function clearFunctions(): void {
  functionDefs.clear();
  functionRefs.clear();
}
