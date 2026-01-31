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
  declaredFunctions: string[];
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
): {
  declarations: string[];
  declaredVars: string[];
  declaredFunctions: string[];
} {
  const declarations: string[] = [];
  const declaredVars: string[] = [];
  const declaredFunctions: string[] = [];

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
    } else if (
      stmt.trim().startsWith("fn ") ||
      stmt.trim().startsWith("function ")
    ) {
      const cleaned = stmt.trim().replace(/;$/, "");
      declarations.push(cleaned);
      // Extract function name from "function <name>(...)"
      const fnMatch = cleaned.match(/^function\s+(\w+)\s*\(/);
      if (fnMatch) {
        declaredFunctions.push(fnMatch[1]);
      }
    } else {
      declarations.push(
        normalizeAndStripNumericTypes(stmt.trim().replace(/;$/, "")),
      );
    }
  }

  return { declarations, declaredVars, declaredFunctions };
}

function processLastStatement(lastStatement: string): {
  normalizedLastStatement: string;
  isFnDeclaration: boolean;
} {
  const trimmed = lastStatement.trim();
  const isFnDeclaration =
    trimmed.startsWith("fn ") || trimmed.startsWith("function ");

  if (isFnDeclaration) {
    return {
      normalizedLastStatement: trimmed.replace(/;$/, ""),
      isFnDeclaration: true,
    };
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
    return {
      declarations: [],
      returnExpr: "",
      declaredVars: [],
      declaredFunctions: [],
    };
  }

  const declaredVarsSet = new Set<string>();
  const lastStatement = statements[statements.length - 1];

  const {
    declarations: stmtDecls,
    declaredVars,
    declaredFunctions,
  } = processStatementsBeforeLast(statements, declaredVarsSet);

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
    declaredFunctions,
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

function findFunctionCallMatch(
  content: string,
  i: number,
  fnName: string,
): { foundCall: boolean; endPos?: number; args?: string } {
  const nameIsAtBoundary =
    (i === 0 || !/[a-zA-Z0-9_.]/.test(content[i - 1])) &&
    (i + fnName.length >= content.length ||
      !/[a-zA-Z0-9_]/.test(content[i + fnName.length]));

  if (!nameIsAtBoundary) {
    return { foundCall: false };
  }

  let j = i + fnName.length;
  while (j < content.length && /\s/.test(content[j])) j++;

  if (j >= content.length || content[j] !== "(") {
    return { foundCall: false };
  }

  // Check if this is a function DECLARATION
  let k = i - 1;
  while (k >= 0 && /\s/.test(content[k])) k--;
  const isFunctionDeclaration = content
    .slice(Math.max(0, k - 7), k + 1)
    .endsWith("function");

  if (isFunctionDeclaration) {
    return { foundCall: false };
  }

  // Extract arguments
  j++;
  let parenDepth = 1;
  let args = "";
  while (j < content.length && parenDepth > 0) {
    if (content[j] === "(") parenDepth++;
    else if (content[j] === ")") parenDepth--;

    if (parenDepth > 0) {
      args += content[j];
    }
    j++;
  }

  return { foundCall: true, endPos: j, args };
}

function rewriteNestedFunctionCallsWithScopeVar(
  content: string,
  functionNames: string[],
): string {
  if (functionNames.length === 0) {
    return content;
  }

  let result = "";
  let i = 0;

  while (i < content.length) {
    let matched = false;

    for (const fnName of functionNames) {
      const match = findFunctionCallMatch(content, i, fnName);
      if (match.foundCall) {
        result += fnName + ".call(__scope";
        if (match.args?.trim()) {
          result += ", " + match.args;
        }
        result += ")";
        i = match.endPos || i + fnName.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result += content[i];
      i++;
    }
  }

  return result;
}

export function buildFunctionBody(
  blockContent: string,
  params: string = "",
): string {
  const { declarations, returnExpr, declaredFunctions } =
    buildBlockReturn(blockContent);

  // If function has nested functions, rewrite their calls to propagate scope
  if (declaredFunctions.length > 0) {
    const paramNames = extractParamNames(params);

    // Always use __scope for nested function calls
    const rewrittenExpr = rewriteNestedFunctionCallsWithScopeVar(
      returnExpr,
      declaredFunctions,
    );
    const rewrittenDeclarations = declarations.map((decl) => {
      return rewriteNestedFunctionCallsWithScopeVar(decl, declaredFunctions);
    });

    if (paramNames.length > 0) {
      // Function has parameters - create __scope with parameter captures
      return buildFunctionWithScope(
        rewrittenDeclarations,
        rewrittenExpr,
        params,
      );
    } else {
      // Function has no parameters - create __scope that chains to parent
      return buildFunctionWithParentScope(rewrittenDeclarations, rewrittenExpr);
    }
  }

  return buildFunctionWithPrefix(declarations, returnExpr);
}

function buildFunctionWithScope(
  declarations: string[],
  returnExpr: string,
  params: string,
): string {
  const declarationStr = declarations.join("; ");
  const paramNames = extractParamNames(params);

  // Create self-referential __scope to support nested function chains
  const paramAssignments = paramNames
    .map((p) => "__scope." + p + " = " + p)
    .join("; ");
  const prefix =
    "let __scope = {this: null}; __scope.this = __scope; " +
    (paramAssignments ? paramAssignments + "; " : "") +
    declarationStr +
    (declarationStr ? "; " : "");
  if (!returnExpr) {
    return prefix;
  }
  return prefix + "return " + returnExpr + ";";
}

function buildFunctionWithParentScope(
  declarations: string[],
  returnExpr: string,
): string {
  const declarationStr = declarations.join("; ");
  const prefix =
    "let __scope = {this: this}; " +
    declarationStr +
    (declarationStr ? "; " : "");
  if (!returnExpr) {
    return prefix;
  }
  return prefix + "return " + returnExpr + ";";
}

function buildSelfReferencingThisReturn(properties: string[]): string {
  if (properties.length === 0) {
    return "let o = {}; o.this = o; return o;";
  }
  const props = properties.map((name) => name + ": " + name).join(", ");
  return "let o = {" + props + "}; o.this = o; return o;";
}

function buildRegularThisReturn(properties: string[]): string {
  if (properties.length === 0) {
    return "return {};";
  }
  const props = properties.map((name) => name + ": " + name).join(", ");
  return "return {" + props + "};";
}

export function buildFunctionBodyWithThisCapture(
  blockContent: string,
  params: string,
  isNestedFunction: boolean = false,
): string {
  const { declarations, returnExpr, declaredVars, declaredFunctions } =
    buildBlockReturn(blockContent);

  if (returnExpr !== "this") {
    return buildFunctionWithPrefix(declarations, returnExpr);
  }

  const prefix = declarations.length > 0 ? declarations.join("; ") + "; " : "";
  const paramNames = extractParamNames(params);
  const allVars = [...paramNames, ...declaredVars, ...declaredFunctions];

  if (isNestedFunction) {
    allVars.push("this");
  }

  if (declaredFunctions.length > 0) {
    return prefix + buildSelfReferencingThisReturn(allVars);
  }

  return prefix + buildRegularThisReturn(allVars);
}

export function convertLetBindingToIIFE(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  if (!returnExpr) return "";
  const d = declarations.length > 0 ? declarations.join("; ") + "; " : "";
  return "(function() { " + d + "return " + returnExpr + "; })()";
}
