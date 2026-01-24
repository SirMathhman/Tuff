import type { Interpreter } from "./expressions/handlers";
import { isValidIdentifier } from "./utils/identifier-utils";
import { registerAnonymousFunction } from "./handlers/anonymous-functions";
import {
  isFunctionType,
  extractReturnTypeFromFunctionType,
} from "./utils/function-utils";
import { createFunctionDeclarationHandler } from "./handlers/function-declaration";
type FnDef = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
};
const functionDefs = new Map<string, FnDef>();
export { functionDefs, registerAnonymousFunction, isFunctionType };
const functionRefs = new Map<string, string>();
export const setFunctionRef = (varName: string, fnName: string) =>
  functionRefs.set(varName, fnName);
export const getFunctionRef = (varName: string) => functionRefs.get(varName);
export const handleFunctionDeclaration =
  createFunctionDeclarationHandler(functionDefs);

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
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex === -1) return undefined;
  const fnName = trimmed.slice(0, parenIndex).trim();
  if (!isValidIdentifier(fnName)) return undefined;
  const referencedFnName = getFunctionRef(fnName);
  const actualFnName = referencedFnName || fnName;
  if (!functionDefs.has(actualFnName)) return undefined;

  let parenDepth = 0,
    closeParenIndex = -1;
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
  if (closeParenIndex === -1) return undefined;

  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();
  const fnDef = functionDefs.get(actualFnName)!;
  const args: number[] = [];
  if (argsStr) {
    const argParts: string[] = [];
    let current = "",
      parenD = 0,
      braceD = 0;
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
    if (current.trim()) argParts.push(current.trim());
    if (argParts.length !== fnDef.params.length)
      throw new Error(
        `function ${actualFnName} expects ${fnDef.params.length} arguments, got ${argParts.length}`,
      );
    for (let i = 0; i < argParts.length; i++) {
      const argStr = argParts[i]!;
      const paramType = fnDef.params[i]?.type;
      if (paramType === -2) {
        const paramTypeStr = fnDef.params[i]?.typeStr;
        const inferredReturnType = paramTypeStr
          ? extractReturnTypeFromFunctionType(paramTypeStr, typeMap)
          : 0;
        const anonResult = registerAnonymousFunction(
          argStr,
          typeMap,
          inferredReturnType,
        );
        if (!anonResult)
          throw new Error(`failed to register lambda: ${argStr}`);
        functionDefs.set(anonResult.name, anonResult.def);
        args.push(1);
        setFunctionRef(`__arg_${i}`, anonResult.name);
      } else {
        args.push(
          interpreter(
            argStr,
            scope,
            typeMap,
            mutMap,
            uninitializedSet,
            unmutUninitializedSet,
          ),
        );
      }
    }
  } else if (fnDef.params.length !== 0)
    throw new Error(
      `function ${actualFnName} expects ${fnDef.params.length} arguments, got 0`,
    );

  const fnScope = new Map<string, boolean>(mutMap),
    fnVarMap = new Map<string, number>();
  for (let i = 0; i < fnDef.params.length; i++) {
    const paramName = fnDef.params[i]?.name;
    const paramType = fnDef.params[i]?.type;
    const paramValue = args[i];
    if (paramName && paramValue !== undefined) {
      if (paramType === -2) {
        setFunctionRef(paramName, getFunctionRef(`__arg_${i}`) || "");
      }
      fnVarMap.set(paramName, paramValue);
      fnScope.set(paramName, false);
    }
  }
  const mergedScope = new Map(scope);
  for (const [k, v] of fnVarMap) mergedScope.set(k, v);
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
