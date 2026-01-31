import {
  extractAndValidateTypesInExpression,
  inferTypeFromValue,
  splitBlockStatements,
} from "./compiler";
import { updateStringState, type StringState } from "./stringState";

/** Strip brace-wrapped expressions and convert let bindings to IIFEs. */
function stripBraceWrappers(input: string): string {
  let result = input;
  const iifeMap = new Map<string, string>();
  let iifeCounter = 0;

  let changed = true;
  while (changed) {
    changed = false;

    const newResult = result.replace(/\{([\s\S]*?)\}/g, (match, inside) => {
      if (inside.includes("{") || inside.includes("}")) {
        return match;
      }
      changed = true;
      inside = inside.trim();

      // Convert blocks with statements to IIFEs to avoid syntax errors in expressions
      if (inside.includes(";")) {
        const iife = convertLetBindingToIIFE(inside);
        const placeholder = "__IIFE_" + iifeCounter + "__";
        iifeMap.set(placeholder, iife);
        iifeCounter++;
        return placeholder;
      }

      // For blocks without statements, just return the content
      return inside;
    });
    result = newResult;
  }

  // Clean up leading/trailing whitespace that may result from empty block replacement
  result = result.replace(/^\s+/, "").replace(/\s+$/, "");

  for (const [placeholder, iife] of iifeMap) {
    result = result.split(placeholder).join(iife);
  }

  return result;
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isKeywordAt(input: string, idx: number, keyword: string): boolean {
  if (input.slice(idx, idx + keyword.length) !== keyword) return false;
  const before = idx > 0 ? input[idx - 1] : "";
  const after =
    idx + keyword.length < input.length ? input[idx + keyword.length] : "";
  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
}

type DepthState = {
  paren: number;
  brace: number;
  bracket: number;
};

function isAtTopLevel(state: DepthState): boolean {
  return state.paren === 0 && state.brace === 0 && state.bracket === 0;
}

function updateDepthState(
  ch: string,
  state: DepthState,
  stopTokens: string[] | undefined,
): { stop: boolean; handled: boolean } {
  if (ch === "(") {
    state.paren++;
    return { stop: false, handled: true };
  }
  if (ch === ")") {
    if (state.paren === 0 && stopTokens?.includes(")")) {
      return { stop: true, handled: true };
    }
    state.paren = Math.max(state.paren - 1, 0);
    return { stop: false, handled: true };
  }
  if (ch === "{") {
    state.brace++;
    return { stop: false, handled: true };
  }
  if (ch === "}") {
    if (state.brace === 0 && stopTokens?.includes("}")) {
      return { stop: true, handled: true };
    }
    state.brace = Math.max(state.brace - 1, 0);
    return { stop: false, handled: true };
  }
  if (ch === "[") {
    state.bracket++;
    return { stop: false, handled: true };
  }
  if (ch === "]") {
    if (state.bracket === 0 && stopTokens?.includes("]")) {
      return { stop: true, handled: true };
    }
    state.bracket = Math.max(state.bracket - 1, 0);
    return { stop: false, handled: true };
  }

  return { stop: false, handled: false };
}

function readBalanced(
  input: string,
  start: number,
  open: string,
  close: string,
): { content: string; end: number } | null {
  if (input[start] !== open) return null;
  let depth = 1;
  const stringState: StringState = { inString: null, escaped: false };
  let i = start + 1;
  while (i < input.length) {
    const ch = input[i];
    if (updateStringState(ch, stringState)) {
      i++;
      continue;
    }

    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return { content: input.slice(start + 1, i), end: i + 1 };
      }
    }
    i++;
  }
  return null;
}

function scanExpression(
  input: string,
  start: number,
  options: { stopOnElse: boolean; stopTokens?: string[] },
): { expr: string; end: number } {
  const stringState: StringState = { inString: null, escaped: false };
  const depthState: DepthState = { paren: 0, brace: 0, bracket: 0 };

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (updateStringState(ch, stringState)) {
      continue;
    }
    const depthResult = updateDepthState(ch, depthState, options.stopTokens);
    if (depthResult.stop) {
      return { expr: input.slice(start, i).trim(), end: i };
    }
    if (depthResult.handled) {
      continue;
    }

    if (isAtTopLevel(depthState)) {
      if (options.stopOnElse && isKeywordAt(input, i, "else")) {
        return { expr: input.slice(start, i).trim(), end: i };
      }
      if (options.stopTokens?.includes(ch)) {
        return { expr: input.slice(start, i).trim(), end: i };
      }
    }
  }

  return { expr: input.slice(start).trim(), end: input.length };
}

function parseIfBranch(
  input: string,
  start: number,
  options: { stopOnElse: boolean },
): { expr: string; end: number } {
  let idx = start;
  while (idx < input.length && /\s/.test(input[idx])) idx++;

  if (input[idx] === "{") {
    const balanced = readBalanced(input, idx, "{", "}");
    if (balanced) {
      return { expr: "{" + balanced.content + "}", end: balanced.end };
    }
  }

  return scanExpression(input, idx, {
    stopOnElse: options.stopOnElse,
    stopTokens: [";", ")", "}", "]", ","],
  });
}

function parseConditionAfterKeyword(
  input: string,
  start: number,
  keywordLength: number,
): { conditionExpr: string; end: number } | null {
  let idx = start + keywordLength;
  while (idx < input.length && /\s/.test(input[idx])) idx++;

  const condition = readBalanced(input, idx, "(", ")");
  if (!condition) return null;
  const conditionExpr = condition.content.trim();

  return { conditionExpr, end: condition.end };
}

function parseIfConditionAndThen(
  input: string,
  start: number,
): {
  conditionExpr: string;
  thenResult: { expr: string; end: number };
  idx: number;
} | null {
  if (!isKeywordAt(input, start, "if")) return null;

  const conditionResult = parseConditionAfterKeyword(input, start, 2);
  if (!conditionResult) return null;

  let idx = conditionResult.end;
  const conditionExpr = conditionResult.conditionExpr;

  const thenResult = parseIfBranch(input, idx, { stopOnElse: true });
  idx = thenResult.end;

  return { conditionExpr, thenResult, idx };
}

function parseElseClause(
  input: string,
  idx: number,
): { elseResult: { expr: string; end: number }; idx: number } | null {
  while (idx < input.length && /\s/.test(input[idx])) idx++;
  if (!isKeywordAt(input, idx, "else")) return null;
  idx += 4;
  const elseResult = parseIfBranch(input, idx, { stopOnElse: false });
  return { elseResult, idx: elseResult.end };
}

export function parseIfExpression(
  input: string,
  start: number,
): { replacement: string; end: number } | null {
  const parsed = parseIfConditionAndThen(input, start);
  if (!parsed) return null;

  const elseClause = parseElseClause(input, parsed.idx);
  if (!elseClause) return null;

  const thenExpr = transformIfExpressions(parsed.thenResult.expr);
  const elseExpr = transformIfExpressions(elseClause.elseResult.expr);
  const replacement =
    "(" + parsed.conditionExpr + " ? " + thenExpr + " : " + elseExpr + ")";

  return { replacement, end: elseClause.idx };
}

export function parseIfStatement(
  input: string,
  start: number,
): { statement: string; end: number } | null {
  const parsed = parseIfConditionAndThen(input, start);
  if (!parsed) return null;

  let idx = parsed.idx;
  let elseStatement = "";
  const elseClause = parseElseClause(input, idx);
  if (elseClause) {
    const elseBody = transformIfExpressions(elseClause.elseResult.expr);
    elseStatement = " else " + elseBody;
    idx = elseClause.idx;
  }

  const thenBody = transformIfExpressions(parsed.thenResult.expr);
  const statement =
    "if (" + parsed.conditionExpr + ") " + thenBody + elseStatement;

  return { statement, end: idx };
}

export function parseWhileStatement(
  input: string,
  start: number,
): { statement: string; end: number } | null {
  if (!isKeywordAt(input, start, "while")) return null;

  const conditionResult = parseConditionAfterKeyword(input, start, 5);
  if (!conditionResult) return null;

  let idx = conditionResult.end;
  const conditionExpr = conditionResult.conditionExpr;

  while (idx < input.length && /\s/.test(input[idx])) idx++;
  const bodyResult = readBalanced(input, idx, "{", "}");
  if (!bodyResult) return null;

  const body = transformIfExpressions(bodyResult.content);
  const statement = "while (" + conditionExpr + ") {" + body + "}";

  return { statement, end: bodyResult.end };
}

function transformIfExpressions(input: string): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (isKeywordAt(input, i, "if")) {
      const parsed = parseIfExpression(input, i);
      if (parsed) {
        result += parsed.replacement;
        i = parsed.end;
        continue;
      }
    }
    result += input[i];
    i++;
  }
  return result;
}

export function normalizeExpression(input: string): string {
  return stripBraceWrappers(transformIfExpressions(input));
}

export function stripNumericTypeSuffixes(input: string): string {
  return input.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );
}

export function convertCharLiteralsToUTF8(input: string): string {
  return input.replace(/'(.)'/g, (match, char) => {
    return String(char.charCodeAt(0));
  });
}

export function convertMutableReference(input: string): string {
  // Convert &mut identifier to {value: identifier}
  return input.replace(/&mut\s+([a-zA-Z_][a-zA-Z0-9_]*)/g, "{value: $1}");
}

export function convertPointerDereference(input: string): string {
  // Convert *identifier to identifier.value
  // Match * followed by an identifier (word characters)
  // Use negative lookbehind to avoid matching multiplication operators
  // that come after numbers or identifiers
  return input.replace(
    /(?<![a-zA-Z0-9_])\*([a-zA-Z_][a-zA-Z0-9_]*)/g,
    "$1.value",
  );
}

export function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n\r]*(?=\n|$)/g, "");
}

export function normalizeAndStripNumericTypes(input: string): string {
  return convertCharLiteralsToUTF8(
    stripNumericTypeSuffixes(normalizeExpression(input)),
  );
}

function readIdentifier(
  input: string,
  start: number,
): { name: string; end: number } | null {
  const match = input.slice(start).match(/^([A-Za-z_]\w*)/);
  if (!match) return null;
  const [name] = match;
  return { name, end: start + name.length };
}

export function skipWhitespace(input: string, start: number): number {
  let idx = start;
  while (idx < input.length && /\s/.test(input[idx])) idx++;
  return idx;
}

function normalizeParamList(paramList: string): string {
  const trimmed = paramList.trim();
  if (!trimmed) return "";
  return trimmed
    .split(",")
    .map((param) => {
      const nameMatch = param.trim().match(/^([A-Za-z_]\w*)/);
      return nameMatch ? nameMatch[1] : "";
    })
    .filter((name) => name.length > 0)
    .join(", ");
}

type BlockReturn = {
  declarations: string[];
  returnExpr: string;
};

function parseLetDeclaration(
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

function buildBlockReturn(blockContent: string): BlockReturn {
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

function buildFunctionBody(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  const bodyPrefix = declarations.join("; ");
  if (!returnExpr) {
    return bodyPrefix ? bodyPrefix + ";" : "";
  }
  return bodyPrefix + (bodyPrefix ? "; " : "") + "return " + returnExpr + ";";
}

function parseFunctionBody(
  input: string,
  idx: number,
): { content: string; end: number } | null {
  // Check if body is braced or a bare expression
  if (input[idx] === "{") {
    const bodyResult = readBalanced(input, idx, "{", "}");
    if (!bodyResult) return null;
    return { content: bodyResult.content, end: bodyResult.end };
  }
  // Handle bare expression body - read until semicolon
  let semiIdx = input.indexOf(";", idx);
  if (semiIdx === -1) {
    semiIdx = input.length;
  }
  const content = input.substring(idx, semiIdx).trim();
  return { content, end: semiIdx };
}

export function parseFunctionDeclaration(
  input: string,
  start: number,
): { declaration: string; end: number } | null {
  if (!isKeywordAt(input, start, "fn")) return null;
  let idx = skipWhitespace(input, start + 2);

  const nameResult = readIdentifier(input, idx);
  if (!nameResult) return null;
  const fnName = nameResult.name;
  idx = skipWhitespace(input, nameResult.end);

  const paramsResult = readBalanced(input, idx, "(", ")");
  if (!paramsResult) return null;
  const params = normalizeParamList(paramsResult.content);
  idx = skipWhitespace(input, paramsResult.end);

  if (input[idx] === ":") {
    idx = skipWhitespace(input, idx + 1);
    const typeResult = readIdentifier(input, idx);
    if (typeResult) {
      idx = skipWhitespace(input, typeResult.end);
    }
  }

  if (input.slice(idx, idx + 2) !== "=>") return null;
  idx = skipWhitespace(input, idx + 2);

  const bodyResult = parseFunctionBody(input, idx);
  if (!bodyResult) return null;

  const functionBody = buildFunctionBody(bodyResult.content);
  const declaration =
    "function " + fnName + "(" + params + ") { " + functionBody + " }";

  return { declaration, end: bodyResult.end };
}

function convertLetBindingToIIFE(blockContent: string): string {
  const { declarations, returnExpr } = buildBlockReturn(blockContent);
  if (!returnExpr) {
    return "";
  }

  const functionBody =
    declarations.join("; ") +
    (declarations.length > 0 ? "; " : "") +
    "return " +
    returnExpr +
    ";";
  return "(function() { " + functionBody + " })()";
}
