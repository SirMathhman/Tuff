import type { Interpreter } from "./expressions/handlers";
import {
  findEqualIndex,
  findDeclStringAndRestIndex,
} from "./utils/scope-helpers";
import {
  handleDestructuring,
  isDestructuringPattern,
} from "./handlers/variables/destructuring";
import {
  handleUninitializedVariable,
  handleVariableInitialization,
} from "./handlers/variables/declaration-helpers";

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet: Set<string> = new Set(),
  visMap: Map<string, boolean> = new Map(),
): number | undefined {
  const trimmed = s.trim();
  const isPublic = trimmed.startsWith("out ");
  const remaining = isPublic ? trimmed.slice(4).trim() : trimmed;

  if (!remaining.startsWith("let ")) return undefined;

  // Handle import syntax: let { ... } from module;
  if (remaining.includes(" from ")) {
    const fromIndex = remaining.indexOf(" from ");
    const beforeFrom = remaining.slice(4, fromIndex).trim();
    if (beforeFrom.startsWith("{") && beforeFrom.endsWith("}")) {
      // This is an import statement, skip it (functions should already be available)
      const semicolonIndex = remaining.indexOf(";");
      if (semicolonIndex !== -1) {
        const rest = remaining.slice(semicolonIndex + 1).trim();
        if (rest) {
          return interpreter(
            rest,
            scope,
            typeMap,
            mutMap,
            uninitializedSet,
            unmutUninitializedSet,
            visMap,
          );
        }
      }
      return 0;
    }
  }

  const { declStr, restIndex } = findDeclStringAndRestIndex(remaining);
  if (!declStr) return undefined;

  const afterLet = declStr.slice(4);
  const colonIndex = afterLet.indexOf(":");
  const beforeColon =
    colonIndex !== -1 ? afterLet.slice(0, colonIndex) : afterLet;
  const isMut = beforeColon.indexOf("mut ") !== -1;
  const eqIndex = findEqualIndex(declStr);

  let result;
  if (eqIndex === -1) {
    result = handleUninitializedVariable(declStr, isMut, typeMap);
  } else {
    const beforeEq = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim();
    const varName = beforeEq;

    if (isDestructuringPattern(varName)) {
      const exprStr = declStr.slice(eqIndex + 1).trim();
      const structValue = handleDestructuring(
        varName,
        exprStr,
        isPublic,
        isMut,
        scope,
        typeMap,
        mutMap,
        visMap,
        uninitializedSet,
        unmutUninitializedSet,
        interpreter,
      );

      const rest = remaining.slice(restIndex).trim();
      if (rest) {
        return interpreter(
          rest,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
          visMap,
        );
      }
      return structValue;
    }

    result = handleVariableInitialization(
      beforeEq,
      eqIndex,
      declStr,
      isMut,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
      visMap,
      interpreter,
    );
  }

  const { varName, varValue, vType, typeName } = result;

  if (scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);

  scope.set(varName, varValue);
  if (vType > 0) typeMap.set(varName, vType);
  else if (vType === -2) typeMap.set(varName, -2);

  if (typeName) {
    typeMap.set("__vartype__" + varName, typeName as unknown as number);
  }

  if (isMut || eqIndex === -1) {
    mutMap.set(varName, true);
  }

  visMap.set(varName, isPublic);

  if (eqIndex === -1) {
    uninitializedSet.add(varName);
    if (!isMut) {
      unmutUninitializedSet.add(varName);
    }
  }

  const rest = remaining.slice(restIndex).trim();
  if (rest) {
    return interpreter(
      rest,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
      visMap,
    );
  }
  return varValue;
}
