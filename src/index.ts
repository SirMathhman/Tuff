import readline from "readline";

// Type ranges for validation
const typeRanges: Record<string, { min: number; max: number }> = {
  U8: { min: 0, max: 255 },
  U16: { min: 0, max: 65535 },
  U32: { min: 0, max: 4294967295 },
  U64: { min: 0, max: 18446744073709551615 },
  I8: { min: -128, max: 127 },
  I16: { min: -32768, max: 32767 },
  I32: { min: -2147483648, max: 2147483647 },
  I64: { min: -9223372036854775808, max: 9223372036854775807 },
  F32: { min: -Infinity, max: Infinity },
  F64: { min: -Infinity, max: Infinity },
};

/**
 * Strip brace-wrapped expressions, treating { ... } as a grouping operator.
 * Also handles `let` variable bindings within blocks.
 * Recursively removes braces from the inner-most expressions outward.
 * For example: { 5 } → 5, (2 + { 3 }) → (2 + 3)
 * Variable bindings: { let x : U8 = 3; x } → (function() { let x = 3; return x; })()
 */
function stripBraceWrappers(input: string): string {
  let result = input;
  const iifeMap = new Map<string, string>();
  let iifeCounter = 0;

  let changed = true;
  while (changed) {
    changed = false;

    // Match { ... } patterns where inside contains no braces (innermost first)
    const newResult = result.replace(/\{\s*([^{}]+)\s*\}/g, (match, inside) => {
      changed = true;
      inside = inside.trim();

      // Check if this is a let binding block (contains 'let' and semicolons)
      if (inside.includes("let ") && inside.includes(";")) {
        // Parse let statements and convert to IIFE
        const iife = convertLetBindingToIIFE(inside);
        const placeholder = `__IIFE_${iifeCounter}__`;
        iifeMap.set(placeholder, iife);
        iifeCounter++;
        return placeholder;
      }

      return inside;
    });
    result = newResult;
  }

  // Replace placeholders with actual IIFEs
  for (const [placeholder, iife] of iifeMap) {
    result = result.split(placeholder).join(iife);
  }

  return result;
}

/**
 * Convert a let binding block to a JavaScript IIFE.
 * For example: 'let x : U8 = 3; x' → '(function() { let x = 3; return x; })()'
 * Throws an error if a variable is declared more than once in the same block.
 */
function convertLetBindingToIIFE(blockContent: string): string {
  // Split by semicolon to separate statements
  const statements = blockContent
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) {
    return "";
  }

  // Process each statement except the last
  const declarations: string[] = [];
  const declaredVars = new Set<string>();
  let lastStatement = statements[statements.length - 1];

  for (let i = 0; i < statements.length - 1; i++) {
    const stmt = statements[i];
    if (stmt.startsWith("let ")) {
      // Parse: let identifier : type = value
      const letMatch = stmt.match(/let\s+(\w+)\s*:\s*(\w+)\s*=\s*(.+)/);
      if (letMatch) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [, varName, _type, value] = letMatch;
        
        // Check for duplicate variable declaration
        if (declaredVars.has(varName)) {
          throw new Error(
            `Variable '${varName}' has already been declared in this block`,
          );
        }
        declaredVars.add(varName);
        
        // Strip type annotations from the value
        const cleanValue = value.replace(
          /(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
          "$1",
        );
        declarations.push(`let ${varName} = ${cleanValue}`);
      }
    }
  }

  // Build the IIFE
  const functionBody =
    declarations.join("; ") +
    (declarations.length > 0 ? "; " : "") +
    `return ${lastStatement};`;
  return `(function() { ${functionBody} })()`;
}

/**
 * Compile Tuff source code to JavaScript.
 * Currently treats expressions as implicit return values.
 * Strips type annotations like U8, U16, I32, etc.
 * Strips brace-wrapped expressions (block expressions).
 * Validates that numeric values are within the range of their type annotation.
 */
export function compile(input: string): string {
  let trimmed = input.trim();

  // Strip brace-wrapped expressions { ... }
  trimmed = stripBraceWrappers(trimmed);

  const typesUsed = validateAndStripTypeAnnotations(trimmed);
  trimmed = trimmed.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );

  // Determine result type and validate
  let resultType: string | undefined;

  if (typesUsed.size > 1) {
    const types = Array.from(typesUsed);
    resultType = determineCoercedType(types);

    if (!resultType) {
      // Types are incompatible
      const sorted = types.sort();
      throw new Error(
        `Type mismatch: cannot mix ${sorted[0]} and ${sorted[1]} in arithmetic expression`,
      );
    }
  } else if (typesUsed.size === 1) {
    resultType = Array.from(typesUsed)[0];
  }

  // Validate result at compile time for non-float types
  if (resultType && resultType !== "F32" && resultType !== "F64") {
    validateExpressionResult(trimmed, resultType);
  }

  // If it doesn't start with "return ", wrap it in a return statement
  // (Check for "return " ensures we're looking for top-level return, not inner returns)
  if (!trimmed.startsWith("return ")) {
    return `return ${trimmed};`;
  }
  return trimmed;
}

/**
 * Check if a numeric value is within the range of its type.
 * Throws an error if the value is outside the range.
 */
function validateInRange(value: number, type: string): void {
  const range = typeRanges[type];

  if (!range) {
    throw new Error(`Unknown type: ${type}`);
  }

  if (value < range.min) {
    throw new Error(
      `Underflow: ${value} is below minimum for ${type} (${range.min})`,
    );
  }
  if (value > range.max) {
    throw new Error(
      `Overflow: ${value} is above maximum for ${type} (${range.max})`,
    );
  }
}

/**
 * Validate type annotations in the input and return the set of types used.
 * Throws errors for underflow/overflow violations.
 */
function validateAndStripTypeAnnotations(input: string): Set<string> {
  const typesUsed: Set<string> = new Set();

  input.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    (match: string, value: string, type: string) => {
      const num = parseInt(value, 10);
      validateInRange(num, type);
      typesUsed.add(type);
      return match;
    },
  );

  return typesUsed;
}

/**
 * Validate that an expression evaluates to a value within the given type's range.
 * Throws an error if the result overflows or underflows the type.
 */
function validateExpressionResult(expression: string, type: string): void {
  try {
    const fn = new Function(`return ${expression}`);
    const result = fn();
    validateInRange(result, type);
  } catch (err) {
    // If it's our underflow/overflow error, rethrow; otherwise continue compilation
    if (
      err instanceof Error &&
      (err.message.startsWith("Underflow:") ||
        err.message.startsWith("Overflow:"))
    ) {
      throw err;
    }
  }
}

/**
 * Find the largest type in a family of types based on the given order.
 */
function findLargestType(types: string[], order: string[]): string {
  return types.reduce((max, current) =>
    order.indexOf(current) > order.indexOf(max) ? current : max,
  );
}

/**
 * Determine the coerced type for a set of types.
 * Returns the coerced type if types are compatible, undefined otherwise.
 */
function determineCoercedType(types: string[]): string | undefined {
  const unsignedInts = ["U8", "U16", "U32", "U64"];
  const signedInts = ["I8", "I16", "I32", "I64"];
  const floats = ["F32", "F64"];

  // Check if all types are in the same family
  const allUnsigned = types.every((t) => unsignedInts.includes(t));
  const allSigned = types.every((t) => signedInts.includes(t));
  const allFloats = types.every((t) => floats.includes(t));

  if (!allUnsigned && !allSigned && !allFloats) {
    return undefined; // Incompatible types
  }

  // Find the largest type in the family
  if (allUnsigned) {
    return findLargestType(types, unsignedInts);
  }

  if (allSigned) {
    return findLargestType(types, signedInts);
  }

  if (allFloats) {
    // F64 > F32
    return types.includes("F64") ? "F64" : "F32";
  }

  return undefined;
}

/**
 * Interpret a program written in the custom language by compiling it to JS
 * and executing the resulting JS.
 *
 * This function always returns a `number`. The compiled JS is executed and
 * its result is coerced to `number` via `Number(...)`. If the compiled code
 * does not produce a numeric value, the function will return `NaN`.
 *
 * Note: Using the Function constructor to execute generated JS. This is a simple
 * runtime for now; consider safer sandboxes if executing untrusted code.
 */
export function interpret(source: string): number {
  const js = compile(source);
  return evaluate(js);
}
function evaluate(bundledJs: string) {
  const fn = new Function(bundledJs);
  const result = fn();
  return Number(result);
}
/**
 * Start a simple REPL that reads lines, runs `interpret` on each input,
 * and prints the numeric result. Use `.exit` or `.quit` to leave.
 */
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

/**
 * Compile a Tuff source file and write the output to a JavaScript file.
 * Wraps the output in an IIFE with process.exit.
 */
export function compileFile(inputPath: string, outputPath: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fs = require("fs") as any;
  const source = fs.readFileSync(inputPath, "utf-8");
  const compiled = compile(source);
  // Wrap in IIFE and add process.exit
  const wrapped = `process.exit((function() {\n  ${compiled}\n})());`;
  fs.writeFileSync(outputPath, wrapped, "utf-8");
  console.log(`Compiled ${inputPath} to ${outputPath}`);
}

const args = process.argv.slice(2);
if (args.includes("--repl")) {
  startRepl();
} else {
  compileFile("./src/main.tuff", "./src/main.js");
}
