/**
 * Stubbed compile function.
 * Takes an input string and returns a (currently identity) string.
 * TODO: implement actual compilation logic.
 */
export function compile(input: string): string {
  // Placeholder implementation — return the input for now
  return input;
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

// Allow using require/module without adding Node types to the project
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const module: any;

/**
 * Start a simple REPL that reads lines, runs `interpret` on each input,
 * and prints the numeric result. Use `.exit` or `.quit` to leave.
 */
export function startRepl(): void {
  const rl = require("readline").createInterface({
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

/* If executed directly (e.g., `node dist/index.js`) start the REPL */
if (
  typeof module !== "undefined" &&
  module &&
  require &&
  require.main === module
) {
  startRepl();
}
