import { extractTypedInfo } from "./parser";
import { extractTypeSize } from "./types";
import type { Interpreter } from "./expressions/handlers";

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet: Set<string> = new Set(),
): number | undefined {
  if (s.indexOf("let ") !== 0) return undefined;
  let semiIndex = -1;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (
      ch === ";" &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      semiIndex = i;
      break;
    }
  }

  // If no semicolon found, check if this might be a declaration with a match or loop expression
  // In that case, look for where the expression ends
  let declStr: string;
  let restIndex: number;

  if (semiIndex === -1) {
    // Look for "match" or "loop" keyword in the assignment value
    const eqIndex = s.indexOf("=");
    if (eqIndex === -1) return undefined;

    const afterEq = s.slice(eqIndex + 1).trim();
    const trimLenDiff = s.slice(eqIndex + 1).length - afterEq.length;

    if (afterEq.startsWith("match") || afterEq.startsWith("loop")) {
      // Find where the expression ends (closing brace at depth 0)
      let exprBraceDepth = 0;
      let exprParenDepth = 0;
      let exprBraceCloseIdx = -1;

      for (let i = 0; i < afterEq.length; i++) {
        const ch = afterEq[i];
        if (ch === "(") exprParenDepth++;
        else if (ch === ")") exprParenDepth--;
        else if (ch === "{") exprBraceDepth++;
        else if (ch === "}") {
          exprBraceDepth--;
          if (exprBraceDepth === 0 && exprParenDepth === 0) {
            exprBraceCloseIdx = i;
            break;
          }
        }
      }

      if (exprBraceCloseIdx !== -1) {
        // The declaration ends where the expression ends
        // restIndex points to right after the closing brace
        restIndex = eqIndex + 1 + trimLenDiff + exprBraceCloseIdx + 1;
        declStr = s.slice(0, restIndex);
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  } else {
    declStr = s.slice(0, semiIndex);
    restIndex = semiIndex + 1;

    // Check if this is a declaration without initialization (no = sign in declStr)
    // This flag is used to mark uninitialized variables as implicitly mutable
  }

  const isMut = declStr.indexOf("mut ") !== -1;
  const eqIndex = declStr.indexOf("=");

  let varName: string;
  let varValue: number = 0;
  let vType = 0;

  if (eqIndex === -1) {
    // No assignment - just declaration with type
    const varPart = declStr.slice(4 + (isMut ? 4 : 0)).trim(),
      colonIndex = varPart.indexOf(":");
    if (colonIndex === -1) {
      // Must have a type annotation for uninitialized variables
      return undefined;
    }
    varName = varPart.slice(0, colonIndex).trim();
    vType = extractTypeSize(varPart.slice(colonIndex + 1).trim());
  } else {
    // Has assignment
    const varPart = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim(),
      colonIndex = varPart.indexOf(":");
    varName = colonIndex !== -1 ? varPart.slice(0, colonIndex).trim() : varPart;

    const exprStr = declStr.slice(eqIndex + 1).trim();
    varValue = interpreter(
      exprStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
    vType =
      extractTypedInfo(exprStr).typeSize ||
      (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
    if (colonIndex !== -1 && vType > 0) {
      const dType = extractTypeSize(varPart.slice(colonIndex + 1).trim());
      if (dType > 0 && vType > dType)
        throw new Error(`bad type: ${vType} to U${dType}`);
    }
  }

  if (scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);

  scope.set(varName, varValue);
  if (vType > 0) typeMap.set(varName, vType);
  // Mark as mutable if explicitly declared with 'mut' or if uninitialized
  if (isMut || eqIndex === -1) {
    mutMap.set(varName, true);
  }
  // Track uninitialized variables - but only those WITHOUT mut become immutable after first assignment
  if (eqIndex === -1) {
    uninitializedSet.add(varName);
    // Only add to unmutUninitializedSet if it's NOT declared with mut
    if (!isMut) {
      unmutUninitializedSet.add(varName);
    }
  }

  const rest = s.slice(restIndex).trim();
  if (rest) {
    return interpreter(
      rest,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }
  return varValue;
}
