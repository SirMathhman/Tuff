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
  normalizeAndStripNumericTypes,
  normalizeExpression,
  parseFunctionDeclaration,
  stripNumericTypeSuffixes,
} from "./compileHelpers";

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

  while (remaining.startsWith("let ") || remaining.startsWith("fn ")) {
    if (remaining.startsWith("fn ")) {
      const parsedFn = parseFunctionDeclaration(remaining, 0);
      if (!parsedFn) {
        break;
      }
      declarations.push(parsedFn.declaration);
      remaining = remaining.substring(parsedFn.end).trim();
      if (remaining.startsWith(";")) {
        remaining = remaining.substring(1).trim();
      }
      continue;
    }

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
    const declMatch = decl.match(/^let\s+(\w+)\s*=\s*([\s\S]+)$/);
    if (declMatch) {
      const [, varName, value] = declMatch;
      const processedValue = normalizeAndStripNumericTypes(value.trim());
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
  let trimmed = normalizeExpression(rawExpression.trim());

  const typesUsed = validateAndStripTypeAnnotations(trimmed);
  trimmed = convertCharLiteralsToUTF8(stripNumericTypeSuffixes(trimmed));
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
