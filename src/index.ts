import readline from "readline";

import { validateVariableTypeCompatibility } from "./types";
import {
  validateAndStripTypeAnnotations,
  extractAndValidateTypesInExpression,
  parseLetStatement,
  determineAndValidateType,
} from "./compiler";
import {
  convertCharLiteralsToUTF8,
  convertMutableReference,
  convertPointerDereference,
  normalizeAndStripNumericTypes,
  normalizeExpression,
  parseFunctionDeclaration,
  stripComments,
  stripNumericTypeSuffixes,
} from "./compileHelpers";

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
): {
  varName: string;
  cleanValue: string;
} | null {
  const extracted = extractSingleLetStatement(statement);
  if (!extracted) {
    return null;
  }

  const { varName, declType, cleanValue, isMutable } = extracted;

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
  const assignMatch = statement.match(
    /^(\w+)\s*((?:[+\-*/%&|^])?=)\s*([\s\S]+)$/,
  );
  if (!assignMatch) {
    return "";
  }

  const [, varName, operator, value] = assignMatch;
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

function processFnDeclaration(
  remaining: string,
  declarations: string[],
): string {
  const parsedFn = parseFunctionDeclaration(remaining, 0);
  if (!parsedFn) {
    return remaining;
  }
  declarations.push(parsedFn.declaration);
  let newRemaining = remaining.substring(parsedFn.end).trim();
  if (newRemaining.startsWith(";")) {
    newRemaining = newRemaining.substring(1).trim();
  }
  return newRemaining;
}

function extractTopLevelStatements(input: string): {
  declarations: string[];
  expression: string;
} {
  const declarations: string[] = [];
  const variableTypes: Record<string, string> = {};
  const mutableVars: Set<string> = new Set();
  let remaining = input.trim();

  while (
    remaining.startsWith("let ") ||
    remaining.startsWith("fn ") ||
    /^\w+\s*(?:[+\-*/%&|^])?=\s*/.test(remaining)
  ) {
    if (remaining.startsWith("fn ")) {
      remaining = processFnDeclaration(remaining, declarations);
      continue;
    }

    const semiIdx = findNextSemicolon(remaining);
    if (semiIdx === -1) break;

    const statement = remaining.substring(0, semiIdx);
    remaining = remaining.substring(semiIdx + 1).trim();

    if (statement.startsWith("let ")) {
      const processed = processSingleLetInTopLevel(
        statement,
        variableTypes,
        mutableVars,
      );
      if (processed) {
        declarations.push(
          "let " + processed.varName + " = " + processed.cleanValue,
        );
      }
    } else {
      const assignStmt = processAssignmentStatement(statement, mutableVars);
      if (assignStmt) {
        declarations.push(assignStmt);
      }
    }
  }

  return { declarations, expression: remaining };
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
    } else if (decl.trim().length > 0) {
      declarations.push(decl);
    }
  }
  return declarations;
}

export function compile(input: string): string {
  const { declarations: rawDeclarations, expression: rawExpression } =
    extractTopLevelStatements(input);
  const declarations = processDeclarations(rawDeclarations);
  let trimmed = normalizeExpression(stripComments(rawExpression).trim());

  const typesUsed = validateAndStripTypeAnnotations(trimmed);
  trimmed = convertPointerDereference(
    convertCharLiteralsToUTF8(stripNumericTypeSuffixes(trimmed)),
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
