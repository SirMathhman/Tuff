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
 * Compile Tuff source code to JavaScript.
 * Currently treats expressions as implicit return values.
 * Strips type annotations like U8, U16, I32, etc.
 * Validates that numeric values are within the range of their type annotation.
 */
export function compile(input: string): string {
  let trimmed = input.trim();
  const typesUsed: Set<string> = new Set();

  // Validate and strip type annotations (e.g., 100U8 -> 100, 42I32 -> 42)
  trimmed = trimmed.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    (match: string, value: string, type: string) => {
      const num = parseInt(value, 10);
      const range = typeRanges[type];

      if (!range) {
        throw new Error(`Unknown type: ${type}`);
      }

      // Check for underflow or overflow of the literal
      if (num < range.min) {
        throw new Error(
          `Underflow: ${num} is below minimum for ${type} (${range.min})`,
        );
      }
      if (num > range.max) {
        throw new Error(
          `Overflow: ${num} is above maximum for ${type} (${range.max})`,
        );
      }

      typesUsed.add(type);
      return value;
    },
  );

  // If all type annotations are from the same type, validate the result at compile time
  if (typesUsed.size === 1) {
    const resultType = Array.from(typesUsed)[0];
    const range = typeRanges[resultType];

    // For non-float types with arithmetic, evaluate at compile time
    if (resultType !== "F32" && resultType !== "F64") {
      try {
        const fn = new Function(`return ${trimmed}`);
        const result = fn();
        if (result < range.min || result > range.max) {
          throw new Error(
            `Overflow: ${result} is above maximum for ${resultType} (${range.max})`,
          );
        }
      } catch (err) {
        // If it's our overflow error, rethrow; otherwise continue compilation
        if (err instanceof Error && err.message.startsWith("Overflow:")) {
          throw err;
        }
      }
    }
  }

  // If it doesn't contain return, wrap it in a return statement
  if (!trimmed.includes("return")) {
    return `return ${trimmed};`;
  }
  return trimmed;
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
  const fs = require("fs");
  const source = fs.readFileSync(inputPath, "utf-8");
  const compiled = compile(source);
  // Wrap in IIFE and add process.exit
  const wrapped = `process.exit((function() {\n  ${compiled}\n})());`;
  fs.writeFileSync(outputPath, wrapped, "utf-8");
  console.log(`Compiled ${inputPath} to ${outputPath}`);
}

/* If executed directly (e.g., `node dist/index.js`) compile ./src/index.tuff to ./src/index.js
   Pass --repl as a CLI argument to start the REPL instead */
if (
  typeof module !== "undefined" &&
  module &&
  require &&
  require.main === module
) {
  const args = process.argv.slice(2);
  if (args.includes("--repl")) {
    startRepl();
  } else {
    compileFile("./src/main.tuff", "./src/main.js");
  }
}
