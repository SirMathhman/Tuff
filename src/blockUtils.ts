import {
  extractAndValidateTypesInExpression,
  inferTypeFromValue,
  splitBlockStatements,
} from "./compiler";
import { normalizeAndStripNumericTypes } from "./conversionUtils";

type BlockReturn = {
  declarations: string[];
  returnExpr: string;
};

export function parseLetDeclaration(
  stmt: string,
  declaredVars: Set<string>,
  validateTypes: boolean,
): string | null {
  const typePattern = /let\s+(\w+)\s*:\s*(\w+)\s*=\s*([\s\S]+)/;
  const noTypePattern = /let\s+(\w+)\s*=\s*([\s\S]+)/;

  let match = stmt.match(typePattern);
  const [varName, declType, value] = match
    ? [match[1], match[2], match[3]]
    : (() => {
        match = stmt.match(noTypePattern);
        return match ? [match[1], undefined, match[2]] : [null, null, null];
      })();

  if (!varName) return null;

  if (declaredVars.has(varName)) {
    throw new Error(
      "Variable '" + varName + "' has already been declared in this block",
    );
  }
  declaredVars.add(varName);

  const trimmedValue = value.trim().replace(/;$/, "");

  if (declType && validateTypes) {
    extractAndValidateTypesInExpression(trimmedValue, declType);
  } else if (!declType && validateTypes) {
    inferTypeFromValue(trimmedValue);
  }

  const cleanValue = trimmedValue.replace(
    /(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );
  return "let " + varName + " = " + cleanValue;
}

export function buildBlockReturn(blockContent: string): BlockReturn {
  const statements = splitBlockStatements(blockContent);
  if (statements.length === 0) {
    return { declarations: [], returnExpr: "" };
  }

  const declarations: string[] = [];
  const declaredVars = new Set<string>();
  const lastStatement = statements[statements.length - 1];

  // Process all statements except the last one
  for (let i = 0; i < statements.length - 1; i++) {
    const stmt = statements[i];
    if (stmt.startsWith("let ")) {
      const decl = parseLetDeclaration(stmt, declaredVars, false);
      if (decl) {
        declarations.push(decl);
      }
    } else {
      // For non-let statements (like assignments), add them as-is
      declarations.push(
        normalizeAndStripNumericTypes(stmt.trim().replace(/;$/, "")),
      );
    }
  }

  // Process let statements in declarations for normalization
  const normalizedDeclarations = declarations.map((decl) => {
    if (decl.startsWith("let ")) {
      const match = decl.match(/^let\s+(\w+)\s*=\s*([\s\S]+)$/);
      if (!match) return decl;
      const [, varName, value] = match;
      const normalizedValue = normalizeAndStripNumericTypes(value.trim());
      return "let " + varName + " = " + normalizedValue;
    }
    // Non-let statements are already normalized above
    return decl;
  });

  const normalizedLastStatement = normalizeAndStripNumericTypes(
    lastStatement.trim().replace(/;$/, ""),
  );

  return {
    declarations: normalizedDeclarations,
    returnExpr: normalizedLastStatement,
  };
}

export function buildFunctionBody(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  const bodyPrefix = declarations.join("; ");
  if (!returnExpr) {
    return bodyPrefix ? bodyPrefix + ";" : "";
  }
  return bodyPrefix + (bodyPrefix ? "; " : "") + "return " + returnExpr + ";";
}

export function convertLetBindingToIIFE(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  if (!returnExpr) return "";
  const d = declarations.length > 0 ? declarations.join("; ") + "; " : "";
  return "(function() { " + d + "return " + returnExpr + "; })()";
}
