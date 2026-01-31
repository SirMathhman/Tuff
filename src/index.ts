import readline from "readline";

import { validateVariableTypeCompatibility } from "./types";
import {
  validateAndStripTypeAnnotations,
  extractAndValidateTypesInExpression,
  parseLetStatement,
  determineAndValidateType,
  parseBlockStatements,
} from "./compiler";
import {
  convertCharLiteralsToUTF8,
  convertMutableReference,
  convertPointerDereference,
  convertThisProperty,
  convertThisTypeVarProperty,
  normalizeAndStripNumericTypes,
  normalizeExpression,
  parseFunctionDeclaration,
  parseIfExpression,
  parseIfStatement,
  parseStructDefinition,
  parseWhileStatement,
  stripComments,
  stripNumericTypeSuffixes,
} from "./compileHelpers";
import { registerStruct } from "./structUtils";

function extractSingleLetStatement(statement: string): {
  varName: string;
  declType: string;
  cleanValue: string;
  isMutable: boolean;
} | null {
  const parsed = parseLetStatement(statement);
  if (!parsed) {
    return null;
  }

  const { varName, declType, value, isMutable } = parsed;

  extractAndValidateTypesInExpression(value, declType);

  const cleanValue = value.replace(
    /(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );

  return { varName, declType, cleanValue, isMutable };
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
  mutableVars: Set<string>,
  thisTypeVars: Set<string>,
): {
  varName: string;
  cleanValue: string;
} | null {
  const extracted = extractSingleLetStatement(statement);
  if (!extracted) {
    return null;
  }

  const { varName, declType, cleanValue, isMutable } = extracted;

  // Track if this is a This type
  if (declType === "This") {
    thisTypeVars.add(varName);
  }

  const referencedVar = findVariableReference(
    Object.keys(variableTypes),
    cleanValue,
  );
  if (referencedVar) {
    const referencedType = variableTypes[referencedVar];
    validateVariableTypeCompatibility(referencedType, declType);
  }

  variableTypes[varName] = declType;

  if (isMutable) {
    mutableVars.add(varName);
  }

  // If declaring a pointer type, wrap the value in an object
  // But don't wrap if value already contains &mut (will be wrapped by reference)
  const containsMutRef = /&mut\s+/.test(cleanValue);
  const alreadyWrapped = /^\{value:\s*/.test(cleanValue);
  const finalValue =
    declType.startsWith("*") && !alreadyWrapped && !containsMutRef
      ? "{value: " + cleanValue + "}"
      : cleanValue;

  return { varName, cleanValue: finalValue };
}

function findNextSemicolon(remaining: string): number {
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
  return semiIdx;
}

function processAssignmentStatement(
  statement: string,
  mutableVars: Set<string>,
): string {
  let varName: string;
  let operator: string;
  let value: string;

  // Handle this.varName assignments
  const thisAssignMatch = statement.match(
    /^this\.\s*(\w+)\s*((?:[+\-*/%&|^])?=)\s*([\s\S]+)$/,
  );
  if (thisAssignMatch) {
    [, varName, operator, value] = thisAssignMatch;
  } else {
    // Handle regular varName assignments
    const assignMatch = statement.match(
      /^(\w+)\s*((?:[+\-*/%&|^])?=)\s*([\s\S]+)$/,
    );
    if (!assignMatch) {
      return "";
    }
    [, varName, operator, value] = assignMatch;
  }

  if (!mutableVars.has(varName)) {
    throw new Error(
      "Cannot assign to immutable variable '" +
        varName +
        "'. Declare it with 'let mut' to allow reassignment.",
    );
  }
  const processedValue = normalizeAndStripNumericTypes(value.trim());
  return varName + " " + operator + " " + processedValue;
}

function advancePastDefinition(remaining: string, end: number): string {
  let newRemaining = remaining.substring(end).trim();
  if (newRemaining.startsWith(";")) {
    newRemaining = newRemaining.substring(1).trim();
  }
  return newRemaining;
}

function processFnDeclaration(
  remaining: string,
  declarations: string[],
): string {
  const parsedFn = parseFunctionDeclaration(remaining, 0);
  if (!parsedFn) {
    return remaining;
  }
  declarations.push(parsedFn.declaration);
  return advancePastDefinition(remaining, parsedFn.end);
}

function processStructDefinition(remaining: string): string {
  const parsedStruct = parseStructDefinition(remaining, 0);
  if (!parsedStruct) {
    return remaining;
  }
  registerStruct(parsedStruct.name, parsedStruct.fields);
  return advancePastDefinition(remaining, parsedStruct.end);
}

function findNextBlockEnd(input: string, start: number): number {
  if (input[start] !== "{") return -1;
  let depth = 1;
  let i = start + 1;
  while (i < input.length && depth > 0) {
    if (input[i] === "{") depth++;
    else if (input[i] === "}") depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

type StatementContext = {
  variableTypes: Record<string, string>;
  mutableVars: Set<string>;
  declarations: string[];
  thisTypeVars: Set<string>;
};

function processStatement(statement: string, context: StatementContext): void {
  if (statement.startsWith("let ")) {
    const processed = processSingleLetInTopLevel(
      statement,
      context.variableTypes,
      context.mutableVars,
      context.thisTypeVars,
    );
    if (processed) {
      context.declarations.push(
        "let " + processed.varName + " = " + processed.cleanValue,
      );
    }
  } else if (statement.trim().length > 0) {
    const assignStmt = processAssignmentStatement(
      statement,
      context.mutableVars,
    );
    if (assignStmt) {
      context.declarations.push(assignStmt);
    }
  }
}

function processBlockStatements(
  blockContent: string,
  context: StatementContext,
): void {
  const { statements } = parseBlockStatements(blockContent);
  for (const stmt of statements) {
    processStatement(stmt, context);
  }
}

function handleTopLevelStatement(
  statement: string,
  context: StatementContext,
): void {
  processStatement(statement, context);
}

function handleTopLevelIf(
  remaining: string,
  declarations: string[],
): string | null {
  if (!remaining.startsWith("if")) return null;

  // First try to parse as a statement (with or without else)
  const parsedStmt = parseIfStatement(remaining, 0);
  if (parsedStmt) {
    const afterIf = remaining.substring(parsedStmt.end).trim();
    // If there's more code after the if statement, treat it as a statement
    if (afterIf.length > 0 && !afterIf.startsWith(";")) {
      declarations.push(parsedStmt.statement);
      return afterIf;
    }
  }

  // Otherwise try as an expression (requires else clause)
  const parsedIf = parseIfExpression(remaining, 0);
  if (parsedIf) {
    const afterIf = remaining.substring(parsedIf.end).trim();
    if (afterIf.length > 0 && !afterIf.startsWith(";")) {
      declarations.push(parsedIf.replacement);
      return afterIf;
    }
  }

  return null;
}

function handleTopLevelWhile(
  remaining: string,
  declarations: string[],
): string | null {
  if (!remaining.startsWith("while")) return null;

  const parsedStmt = parseWhileStatement(remaining, 0);
  if (parsedStmt) {
    const afterWhile = remaining.substring(parsedStmt.end).trim();
    // If there's more code after the while statement, treat it as a statement
    if (afterWhile.length > 0 && !afterWhile.startsWith(";")) {
      declarations.push(parsedStmt.statement);
      return afterWhile;
    }
  }

  return null;
}

function handleTopLevelBlock(
  remaining: string,
  variableTypes: Record<string, string>,
  mutableVars: Set<string>,
  declarations: string[],
  thisTypeVars: Set<string>,
): string | null {
  if (!remaining.startsWith("{")) return null;
  const blockEndIdx = findNextBlockEnd(remaining, 0);
  if (blockEndIdx !== -1) {
    const afterBlock = remaining.substring(blockEndIdx + 1).trim();
    if (afterBlock.length > 0 && !afterBlock.startsWith(";")) {
      const context: StatementContext = {
        variableTypes,
        mutableVars,
        declarations,
        thisTypeVars,
      };
      processBlockStatements(remaining.substring(1, blockEndIdx), context);
      return afterBlock;
    }
  }
  return null;
}

function isTopLevelTrigger(remaining: string): boolean {
  return (
    remaining.startsWith("let ") ||
    remaining.startsWith("fn ") ||
    remaining.startsWith("struct ") ||
    remaining.startsWith("{") ||
    remaining.startsWith("if") ||
    remaining.startsWith("while") ||
    remaining.startsWith("this.") ||
    /^\w+\s*(?:[+\-*/%&|^])?=\s*/.test(remaining)
  );
}

function tryHandleControlFlow(
  remaining: string,
  declarations: string[],
  variableTypes: Record<string, string>,
  mutableVars: Set<string>,
  thisTypeVars: Set<string>,
): string | null {
  if (remaining.startsWith("fn ")) {
    return processFnDeclaration(remaining, declarations);
  }

  if (remaining.startsWith("struct ")) {
    return processStructDefinition(remaining);
  }

  const ifResult = handleTopLevelIf(remaining, declarations);
  if (ifResult !== null) return ifResult;

  const whileResult = handleTopLevelWhile(remaining, declarations);
  if (whileResult !== null) return whileResult;

  const blockResult = handleTopLevelBlock(
    remaining,
    variableTypes,
    mutableVars,
    declarations,
    thisTypeVars,
  );
  if (blockResult !== null) return blockResult;

  return null;
}

function extractTopLevelStatements(input: string): {
  declarations: string[];
  expression: string;
  thisTypeVars: Set<string>;
} {
  const declarations: string[] = [];
  const variableTypes: Record<string, string> = {};
  const mutableVars: Set<string> = new Set();
  const thisTypeVars: Set<string> = new Set();
  let remaining = input.trim();

  while (isTopLevelTrigger(remaining)) {
    const controlFlowResult = tryHandleControlFlow(
      remaining,
      declarations,
      variableTypes,
      mutableVars,
      thisTypeVars,
    );
    if (controlFlowResult !== null) {
      remaining = controlFlowResult;
      continue;
    }

    const semiIdx = findNextSemicolon(remaining);
    if (semiIdx === -1) break;
    const context: StatementContext = {
      variableTypes,
      mutableVars,
      declarations,
      thisTypeVars,
    };
    handleTopLevelStatement(remaining.substring(0, semiIdx), context);
    remaining = remaining.substring(semiIdx + 1).trim();
  }

  return { declarations, expression: remaining, thisTypeVars };
}

function processDeclarations(rawDeclarations: string[]): string[] {
  const declarations: string[] = [];
  for (const decl of rawDeclarations) {
    const declMatch = decl.match(/^let\s+(\w+)\s*=\s*([\s\S]+)$/);
    if (declMatch) {
      const [, varName, value] = declMatch;
      // Convert &mut references first
      const refConverted = convertMutableReference(value.trim());
      // Skip normalization for pointer wrapper objects {value: ...}
      const isPointerWrapper = /^\{value:\s*/.test(refConverted);
      const processedValue = isPointerWrapper
        ? refConverted
        : normalizeAndStripNumericTypes(refConverted);
      declarations.push("let " + varName + " = " + processedValue);
    } else if (decl.trim().startsWith("function ")) {
      // Don't normalize function declarations - push as-is
      declarations.push(decl.trim());
    } else if (decl.trim().length > 0) {
      declarations.push(normalizeAndStripNumericTypes(decl));
    }
  }
  return declarations;
}

export function compile(input: string): string {
  const {
    declarations: rawDeclarations,
    expression: rawExpression,
    thisTypeVars,
  } = extractTopLevelStatements(input);
  const declarations = processDeclarations(rawDeclarations);
  let trimmed = normalizeExpression(stripComments(rawExpression).trim());

  const typesUsed = validateAndStripTypeAnnotations(trimmed);
  trimmed = convertThisTypeVarProperty(
    convertThisProperty(
      convertPointerDereference(
        convertCharLiteralsToUTF8(stripNumericTypeSuffixes(trimmed)),
      ),
    ),
    thisTypeVars,
  );
  if (trimmed === "") {
    trimmed = "0";
  }
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
