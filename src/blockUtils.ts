import {
  extractAndValidateTypesInExpression,
  inferTypeFromValue,
  splitBlockStatements,
} from "./compiler";
import { normalizeAndStripNumericTypes } from "./conversionUtils";

type BlockReturn = {
  declarations: string[];
  returnExpr: string;
  declaredVars: string[];
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

function normalizeDeclarations(declarations: string[]): string[] {
  return declarations.map((decl) => {
    if (decl.startsWith("let ")) {
      const match = decl.match(/^let\s+(\w+)\s*=\s*([\s\S]+)$/);
      if (!match) return decl;
      const [, varName, value] = match;
      const normalizedValue = normalizeAndStripNumericTypes(value.trim());
      return "let " + varName + " = " + normalizedValue;
    }
    return decl;
  });
}

function processStatementsBeforeLast(
  statements: string[],
  declaredVarsSet: Set<string>,
): { declarations: string[]; declaredVars: string[] } {
  const declarations: string[] = [];
  const declaredVars: string[] = [];

  for (let i = 0; i < statements.length - 1; i++) {
    const stmt = statements[i];
    if (stmt.startsWith("let ")) {
      const decl = parseLetDeclaration(stmt, declaredVarsSet, false);
      if (decl) {
        declarations.push(decl);
        const varMatch = decl.match(/^let\s+(\w+)\s*=/);
        if (varMatch) {
          declaredVars.push(varMatch[1]);
        }
      }
    } else if (stmt.trim().startsWith("fn ") || stmt.trim().startsWith("function ")) {
      declarations.push(stmt.trim().replace(/;$/, ""));
    } else {
      declarations.push(
        normalizeAndStripNumericTypes(stmt.trim().replace(/;$/, "")),
      );
    }
  }

  return { declarations, declaredVars };
}

function processLastStatement(
  lastStatement: string,
): { normalizedLastStatement: string; isFnDeclaration: boolean } {
  const trimmed = lastStatement.trim();
  const isFnDeclaration =
    trimmed.startsWith("fn ") || trimmed.startsWith("function ");

  if (isFnDeclaration) {
    return { normalizedLastStatement: trimmed.replace(/;$/, ""), isFnDeclaration: true };
  }

  return {
    normalizedLastStatement: normalizeAndStripNumericTypes(
      trimmed.replace(/;$/, ""),
    ),
    isFnDeclaration: false,
  };
}

export function buildBlockReturn(blockContent: string): BlockReturn {
  const statements = splitBlockStatements(blockContent);
  if (statements.length === 0) {
    return { declarations: [], returnExpr: "", declaredVars: [] };
  }

  const declaredVarsSet = new Set<string>();
  const lastStatement = statements[statements.length - 1];

  const { declarations: stmtDecls, declaredVars } = processStatementsBeforeLast(
    statements,
    declaredVarsSet,
  );

  const { normalizedLastStatement, isFnDeclaration } =
    processLastStatement(lastStatement);

  const declarations = isFnDeclaration
    ? [...stmtDecls, normalizedLastStatement]
    : stmtDecls;

  const normalizedDeclarations = normalizeDeclarations(declarations);

  return {
    declarations: normalizedDeclarations,
    returnExpr: isFnDeclaration ? "" : normalizedLastStatement,
    declaredVars,
  };
}

function buildFunctionWithPrefix(
  declarations: string[],
  returnExpr: string,
): string {
  const bodyPrefix = declarations.join("; ");
  if (!returnExpr) {
    return bodyPrefix ? bodyPrefix + ";" : "";
  }
  return bodyPrefix + (bodyPrefix ? "; " : "") + "return " + returnExpr + ";";
}

export function extractParamNames(params: string): string[] {
  return params
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function buildFunctionBody(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  return buildFunctionWithPrefix(declarations, returnExpr);
}

export function buildFunctionBodyWithThisCapture(
  blockContent: string,
  params: string,
): string {
  const { declarations, returnExpr, declaredVars } =
    buildBlockReturn(blockContent);

  // If the return expression is "this", capture all variables (params + locals)
  if (returnExpr === "this") {
    const paramNames = extractParamNames(params);
    const allVars = [...paramNames, ...declaredVars];

    if (allVars.length === 0) {
      const prefix =
        declarations.length > 0 ? declarations.join("; ") + "; " : "";
      return prefix + "return {};";
    }

    const properties = allVars.map((name) => name + ": " + name).join(", ");
    const prefix =
      declarations.length > 0 ? declarations.join("; ") + "; " : "";
    return prefix + "return {" + properties + "};";
  }

  // Otherwise use normal function body building
  return buildFunctionWithPrefix(declarations, returnExpr);
}

export function convertLetBindingToIIFE(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  if (!returnExpr) return "";
  const d = declarations.length > 0 ? declarations.join("; ") + "; " : "";
  return "(function() { " + d + "return " + returnExpr + "; })()";
}
