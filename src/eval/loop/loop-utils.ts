import { type VariableEntry } from "../variables-types";

export function syncMutableVars(
  iterationVars: Map<string, VariableEntry>,
  loopVars: Map<string, VariableEntry>,
): void {
  for (const [key, entry] of iterationVars.entries()) {
    const originalEntry = loopVars.get(key);
    if (originalEntry && originalEntry.isMutable) {
      originalEntry.value = entry.value;
    }
  }
}

export function findClosingParen(expr: string, openParen: number): number {
  let depth = 0,
    closeParen = -1;
  for (let i = openParen; i < expr.length; i = i + 1) {
    const ch = expr.charAt(i);
    if (ch === "(") depth = depth + 1;
    if (ch === ")") {
      depth = depth - 1;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  return closeParen;
}

export function findMatchingBrace(
  str: string,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0,
    closeIdx = -1;
  for (let i = 0; i < str.length; i = i + 1) {
    const ch = str.charAt(i);
    if (ch === openChar) depth = depth + 1;
    if (ch === closeChar) {
      depth = depth - 1;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  return closeIdx;
}
