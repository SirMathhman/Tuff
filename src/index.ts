import readline from "readline";

import { validateVariableTypeCompatibility } from "./types";
import {
  validateAndStripTypeAnnotations,
  extractAndValidateTypesInExpression,
  inferTypeFromValue,
  parseLetStatement,
  determineAndValidateType,
  splitBlockStatements,
  processLetStatements,
} from "./compiler";

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

      if (inside.includes("let ") && inside.includes(";")) {
        const iife = convertLetBindingToIIFE(inside);
        const placeholder = "__IIFE_" + iifeCounter + "__";
        iifeMap.set(placeholder, iife);
        iifeCounter++;
        return placeholder;
      }

      return inside;
    });
    result = newResult;
  }

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

type StringState = {
  inString: string | null;
  escaped: boolean;
};

function updateStringState(ch: string, state: StringState): boolean {
  if (state.inString) {
    if (state.escaped) {
      state.escaped = false;
    } else if (ch === "\\") {
      state.escaped = true;
    } else if (ch === state.inString) {
      state.inString = null;
    }
    return true;
  }

  if (ch === '"' || ch === "'" || ch === "`") {
    state.inString = ch;
    return true;
  }

  return false;
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

function parseIfExpression(
  input: string,
  start: number,
): { replacement: string; end: number } | null {
  if (!isKeywordAt(input, start, "if")) return null;
  let idx = start + 2;
  while (idx < input.length && /\s/.test(input[idx])) idx++;

  const condition = readBalanced(input, idx, "(", ")");
  if (!condition) return null;
  const conditionExpr = condition.content.trim();
  idx = condition.end;

  while (idx < input.length && /\s/.test(input[idx])) idx++;
  const thenResult = scanExpression(input, idx, { stopOnElse: true });
  idx = thenResult.end;

  while (idx < input.length && /\s/.test(input[idx])) idx++;
  if (!isKeywordAt(input, idx, "else")) return null;
  idx += 4;
  while (idx < input.length && /\s/.test(input[idx])) idx++;

  const elseResult = scanExpression(input, idx, {
    stopOnElse: false,
    stopTokens: [";", ")", "}", "]", ","],
  });

  const thenExpr = transformIfExpressions(thenResult.expr);
  const elseExpr = transformIfExpressions(elseResult.expr);
  const replacement =
    "(" + conditionExpr + " ? " + thenExpr + " : " + elseExpr + ")";

  return { replacement, end: elseResult.end };
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

function normalizeExpression(input: string): string {
  return transformIfExpressions(stripBraceWrappers(input));
}

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

function convertLetBindingToIIFE(blockContent: string): string {
  const statements = splitBlockStatements(blockContent);

  if (statements.length === 0) {
    return "";
  }

  const declarations: string[] = [];
  const declaredVars = new Set<string>();
  const lastStatement = statements[statements.length - 1];

  processLetStatements(statements, (stmt: string) => {
    const decl = parseLetDeclaration(stmt, declaredVars, false);
    if (decl) {
      declarations.push(decl);
    }
  });

  const normalizedDeclarations = declarations.map((decl) => {
    const match = decl.match(/let\s+(\w+)\s*=\s*([\s\S]+)/);
    if (!match) return decl;
    const [, varName, value] = match;
    const normalizedValue = normalizeExpression(value.trim());
    return "let " + varName + " = " + normalizedValue;
  });
  const normalizedLastStatement = normalizeExpression(lastStatement.trim());

  const functionBody =
    normalizedDeclarations.join("; ") +
    (normalizedDeclarations.length > 0 ? "; " : "") +
    "return " +
    normalizedLastStatement +
    ";";
  return "(function() { " + functionBody + " })()";
}

function extractSingleLetStatement(statement: string): {
  varName: string;
  declType: string;
  cleanValue: string;
} | null {
  const parsed = parseLetStatement(statement);
  if (!parsed) {
    return null;
  }

  const { varName, declType, value } = parsed;

  extractAndValidateTypesInExpression(value, declType);

  const cleanValue = value.replace(
    /(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );

  return { varName, declType, cleanValue };
}

function findVariableReference(
  varNames: string[],
  value: string,
): string | null {
  const cleanedValue = value
    .replace(/'([^']|\')*'/g, "")
    .replace(/"([^"]|\\")*"/g, "");

  for (const varName of varNames) {
    const regex = new RegExp("\\b" + varName + "\\b");
    if (regex.test(cleanedValue)) {
      return varName;
    }
  }
  return null;
}

function processSingleLetInTopLevel(
  statement: string,
  variableTypes: Record<string, string>,
): {
  varName: string;
  cleanValue: string;
} | null {
  const extracted = extractSingleLetStatement(statement);
  if (!extracted) {
    return null;
  }

  const { varName, declType, cleanValue } = extracted;

  const referencedVar = findVariableReference(
    Object.keys(variableTypes),
    cleanValue,
  );
  if (referencedVar) {
    const referencedType = variableTypes[referencedVar];
    validateVariableTypeCompatibility(referencedType, declType);
  }

  variableTypes[varName] = declType;

  return { varName, cleanValue };
}

function extractTopLevelStatements(input: string): {
  declarations: string[];
  expression: string;
} {
  const declarations: string[] = [];
  const variableTypes: Record<string, string> = {};
  let remaining = input.trim();

  while (remaining.startsWith("let ")) {
    let semiIdx = -1;
    let braceDepth = 0;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === "{") braceDepth++;
      else if (remaining[i] === "}") braceDepth--;
      else if (remaining[i] === ";" && braceDepth === 0) {
        semiIdx = i;
        break;
      }
    }

    if (semiIdx === -1) break;

    const statement = remaining.substring(0, semiIdx);
    remaining = remaining.substring(semiIdx + 1).trim();

    const processed = processSingleLetInTopLevel(statement, variableTypes);
    if (processed) {
      declarations.push(
        "let " + processed.varName + " = " + processed.cleanValue,
      );
    }
  }

  return { declarations, expression: remaining };
}

function processDeclarations(rawDeclarations: string[]): string[] {
  const declarations: string[] = [];
  for (const decl of rawDeclarations) {
    const declMatch = decl.match(/let\s+(\w+)\s*=\s*([\s\S]+)/);
    if (declMatch) {
      const [, varName, value] = declMatch;
      let processedValue = normalizeExpression(value.trim());
      processedValue = processedValue.replace(
        /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
        "$1",
      );
      declarations.push("let " + varName + " = " + processedValue);
    }
  }
  return declarations;
}

export function compile(input: string): string {
  const { declarations: rawDeclarations, expression: rawExpression } =
    extractTopLevelStatements(input);
  const declarations = processDeclarations(rawDeclarations);
  let trimmed = normalizeExpression(rawExpression.trim());

  const typesUsed = validateAndStripTypeAnnotations(trimmed);
  trimmed = trimmed.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );
  determineAndValidateType(trimmed, typesUsed);

  let compiled = "";
  if (declarations.length > 0) {
    compiled += declarations.join(";\n") + ";\n";
  }

  if (!trimmed.startsWith("return ")) {
    compiled += "return " + trimmed + ";";
  } else {
    compiled += trimmed;
  }

  return compiled;
}

export function interpret(source: string): number {
  const js = compile(source);
  return evaluate(js);
}

function evaluate(bundledJs: string) {
  const fn = new Function(bundledJs);
  const result = fn();
  return Number(result);
}

export function startRepl(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "tuff> ",
  });
  rl.prompt();
  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (trimmed === ".exit" || trimmed === ".quit") {
      rl.close();
      return;
    }
    if (trimmed === "") {
      rl.prompt();
      return;
    }
    try {
      const value = interpret(trimmed);
      console.log(value);
    } catch (err) {
      console.error("Error:", err);
    }
    rl.prompt();
  }).on("close", () => {
    console.log("Bye");
    process.exit(0);
  });
}

export function compileFile(inputPath: string, outputPath: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fs = require("fs") as any;
  const source = fs.readFileSync(inputPath, "utf-8");
  const compiled = compile(source);
  const wrapped =
    "process.exit(Number((function() {\n  " + compiled + "\n})()));";
  fs.writeFileSync(outputPath, wrapped, "utf-8");
  console.log("Compiled " + inputPath + " to " + outputPath);
}

const args = process.argv.slice(2);
if (args.includes("--repl")) {
  startRepl();
} else {
  compileFile("./src/main.tuff", "./src/main.js");
}
