import {
  isIdentifierChar,
  isWhitespace,
  matchWord,
} from "../../parsing/string-helpers";
import {
  getDropHandler,
  isDroppableType,
  parseLetDeclaration,
} from "../../parsing/parser-utils";
import { getCompileStructDefs } from "../../struct-defs-storage";
import { isProbablyControlFlowBrace } from "../helpers/brace-handlers";
import {
  findMatchingCloseBrace,
  findPrevNonWhitespace,
  isQuote,
  skipStringLiteral,
  scanTopLevel,
} from "./scan-helpers";

function startsWithAnyKeyword(s: string, keywords: string[]): boolean {
  const trimmed = s.trimStart();
  for (const keyword of keywords) {
    if (
      trimmed.startsWith(keyword) &&
      (trimmed.length === keyword.length ||
        isWhitespace(trimmed[keyword.length]!) ||
        trimmed[keyword.length] === "{" ||
        trimmed[keyword.length] === "(")
    )
      return true;
  }
  return false;
}

function extractArrayElementType(typeName: string): string | undefined {
  const trimmed = typeName.trim();
  if (!trimmed.startsWith("[")) return undefined;
  let i = 1;
  while (i < trimmed.length && isWhitespace(trimmed[i]!)) i++;
  const start = i;
  while (i < trimmed.length) {
    const ch = trimmed[i]!;
    if (ch === ";" || ch === "]") break;
    i++;
  }
  const elementType = trimmed.slice(start, i).trim();
  return elementType || undefined;
}

function findDropStatementsForVar(
  varName: string,
  typeNameRaw: string,
): string[] {
  const typeName = typeNameRaw.trim();

  const elementType = extractArrayElementType(typeName);
  if (elementType && isDroppableType(elementType)) {
    const dropFn = getDropHandler(elementType);
    if (!dropFn) return [];
    return [
      `for (let __i = 0; __i < ${varName}.length; __i++) { ${dropFn}(${varName}[__i]); }`,
    ];
  }

  const structDef = getCompileStructDefs().get(typeName);
  if (structDef) {
    const out: string[] = [];
    for (const [fieldName, fieldType] of structDef.fields.entries()) {
      if (!isDroppableType(fieldType)) continue;
      const dropFn = getDropHandler(fieldType);
      if (!dropFn) continue;
      out.push(`${dropFn}(${varName}.${fieldName});`);
    }
    return out;
  }

  if (isDroppableType(typeName)) {
    const dropFn = getDropHandler(typeName);
    if (!dropFn) return [];
    return [`${dropFn}(${varName});`];
  }

  return [];
}

function splitTopLevelStatements(source: string): string[] {
  const statements: string[] = [];
  let start = 0;

  scanTopLevel(source, (i) => {
    if (source[i] !== ";") return undefined;
    const part = source.slice(start, i).trim();
    if (part) statements.push(part);
    start = i + 1;
    return i + 1;
  });

  const tail = source.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function isScopeBlockOpenBrace(source: string, openIdx: number): boolean {
  if (source[openIdx] !== "{") return false;

  const prevIdx = findPrevNonWhitespace(source, openIdx - 1);
  if (prevIdx >= 0) {
    const prevCh = source[prevIdx]!;
    if (prevCh !== ";" && prevCh !== "{" && prevCh !== "}") return false;
    if (isIdentifierChar(prevCh) || prevCh === ")" || prevCh === "]")
      return false;
  }

  const before = source.slice(0, openIdx);
  if (isProbablyControlFlowBrace(source, openIdx, before)) return false;
  return true;
}

function collectDroppableVarsAtTopLevel(
  blockContent: string,
): Array<{ varName: string; typeName: string }> {
  const vars: Array<{ varName: string; typeName: string }> = [];

  scanTopLevel(blockContent, (i) => {
    if (!matchWord(blockContent, i, "let")) return undefined;
    const decl = parseLetDeclaration(blockContent, i);
    const effectiveType = (
      decl.typeAnnotation ||
      decl.inferredType ||
      ""
    ).trim();
    if (decl.varName && effectiveType)
      vars.push({ varName: decl.varName, typeName: effectiveType });
    return decl.nextIndex;
  });

  return vars;
}

function computeReturnForScope(blockContent: string): {
  body: string;
  returnExpr: string;
} {
  const statements = splitTopLevelStatements(blockContent);
  if (statements.length === 0) return { body: "", returnExpr: "0" };

  const last = statements[statements.length - 1]!;
  const nonExprKeywords = [
    "let",
    "type",
    "struct",
    "fn",
    "module",
    "object",
    "for",
    "while",
    "if",
    "else",
    "match",
    "loop",
    "try",
    "catch",
  ];
  if (startsWithAnyKeyword(last, nonExprKeywords) || last.endsWith("}")) {
    return { body: statements.join("; ") + ";", returnExpr: "0" };
  }

  const bodyStatements = statements.slice(0, -1);
  const body = bodyStatements.length > 0 ? bodyStatements.join("; ") + ";" : "";
  return { body, returnExpr: last };
}

export function transformDestructorScopes(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    if (isQuote(ch)) {
      const next = skipStringLiteral(source, i);
      result += source.slice(i, next);
      i = next;
      continue;
    }

    if (ch === "{" && isScopeBlockOpenBrace(source, i)) {
      const closeIdx = findMatchingCloseBrace(source, i);
      if (closeIdx === -1) {
        result += ch;
        i++;
        continue;
      }

      const rawContent = source.slice(i + 1, closeIdx);
      const transformedContent = transformDestructorScopes(rawContent);

      const droppableVars = collectDroppableVarsAtTopLevel(transformedContent);
      const dropStatements: string[] = [];
      for (const v of droppableVars) {
        dropStatements.push(...findDropStatementsForVar(v.varName, v.typeName));
      }

      const { body, returnExpr } = computeReturnForScope(transformedContent);
      const drops = dropStatements.length > 0 ? dropStatements.join(" ") : "";

      result += `(()=>{ ${body} ${drops} return (${returnExpr}); })();`;
      i = closeIdx + 1;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}
