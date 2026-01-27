import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
  isDigit,
  skipAngleBrackets,
  skipBracePair,
} from "../string-helpers";
import { parseCondition } from "../parse-helpers";
import { getCompileStructDefs } from "../../struct-defs-storage";

export function validateIsGuardFieldAccess(
  source: string,
  startIndex: number,
): void {
  let i = startIndex + 2; // Skip 'if'
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i >= source.length || source[i] !== "(") return;
  const { condition: guardExpr, endIdx: guardEnd } = parseCondition(source, i);
  const guardInfo = parseIsGuard(guardExpr);
  if (!guardInfo) return;
  const bodyRange = extractThenBodyRange(source, guardEnd);
  if (bodyRange.end <= bodyRange.start) return;
  validatePropertyAccessInRange(
    source,
    bodyRange.start,
    bodyRange.end,
    guardInfo.varName,
    guardInfo.typeName,
  );
}

function parseIsGuard(
  expr: string,
): { varName: string; typeName: string } | undefined {
  let i = 0;
  while (i < expr.length && isWhitespace(expr[i])) i++;
  const nameStart = i;
  if (i >= expr.length || !isIdentifierChar(expr[i]) || isDigit(expr[i]))
    return undefined;
  while (i < expr.length && isIdentifierChar(expr[i])) i++;
  const varName = expr.slice(nameStart, i);
  while (i < expr.length && isWhitespace(expr[i])) i++;
  if (!matchWord(expr, i, "is")) return undefined;
  i += 2;
  while (i < expr.length && isWhitespace(expr[i])) i++;
  const typeStart = i;
  while (i < expr.length) {
    const ch = expr[i];
    if (isIdentifierChar(ch)) {
      i++;
      continue;
    }
    if (ch === "<") {
      i = skipAngleBrackets(expr, i);
      continue;
    }
    break;
  }
  const typeName = expr.slice(typeStart, i).trim();
  if (!varName || !typeName) return undefined;
  return { varName, typeName };
}

function extractThenBodyRange(
  source: string,
  start: number,
): { start: number; end: number } {
  let i = start;
  while (i < source.length && isWhitespace(source[i])) i++;
  if (i < source.length && source[i] === "{") {
    const end = skipBracePair(source, i);
    return { start: i, end };
  }
  const elseIndex = findElseWord(source, i);
  const end = elseIndex !== -1 ? elseIndex : findStatementEnd(source, i);
  return { start: i, end };
}

function findElseWord(source: string, start: number): number {
  let i = start;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth = Math.max(depth - 1, 0);
    } else if (depth === 0 && matchWord(source, i, "else")) {
      return i;
    }
    i++;
  }
  return -1;
}

function findStatementEnd(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    if (source[i] === ";" || source[i] === "\n") {
      return i;
    }
    i++;
  }
  return i;
}

function validatePropertyAccessInRange(
  source: string,
  start: number,
  end: number,
  varName: string,
  typeName: string,
): void {
  let idx = start;
  while (idx < end) {
    const found = source.indexOf(varName, idx);
    if (found === -1 || found >= end) break;
    const prevChar = found - 1 >= 0 ? source[found - 1] : "";
    if (found > start && isIdentifierChar(prevChar)) {
      idx = found + 1;
      continue;
    }
    const after = found + varName.length;
    if (after < end && source[after] === ".") {
      const fieldStart = after + 1;
      if (fieldStart >= end || !isIdentifierChar(source[fieldStart])) {
        idx = found + 1;
        continue;
      }
      let fieldEnd = fieldStart;
      while (fieldEnd < end && isIdentifierChar(source[fieldEnd])) fieldEnd++;
      const fieldName = source.slice(fieldStart, fieldEnd);
      if (!hasFieldOnType(typeName, fieldName)) {
        throw new Error(
          `Type '${typeName}' cannot access field '${fieldName}' after 'is' guard`,
        );
      }
      idx = fieldEnd;
      continue;
    }
    idx = found + 1;
  }
}

function stripGenerics(typeName: string): string {
  const genericStart = typeName.indexOf("<");
  if (genericStart === -1) return typeName.trim();
  return typeName.slice(0, genericStart).trim();
}

function hasFieldOnType(typeName: string, fieldName: string): boolean {
  const baseType = stripGenerics(typeName);
  if (!baseType) return false;
  const structDefs = getCompileStructDefs();
  const structDef = structDefs.get(baseType);
  if (!structDef) return false;
  return structDef.fields.has(fieldName);
}
