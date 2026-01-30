"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compile = compile;
exports.interpret = interpret;
exports.startRepl = startRepl;
exports.compileFile = compileFile;
/**
 * Compile Tuff source code to JavaScript.
 * Currently treats expressions as implicit return values.
 */
function compile(input) {
    const trimmed = input.trim();
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
function interpret(source) {
    const js = compile(source);
    return evaluate(js);
}
function evaluate(bundledJs) {
    const fn = new Function(bundledJs);
    const result = fn();
    return Number(result);
}
/**
 * Start a simple REPL that reads lines, runs `interpret` on each input,
 * and prints the numeric result. Use `.exit` or `.quit` to leave.
 */
function startRepl() {
    const rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "tuff> ",
    });
    rl.prompt();
    rl.on("line", (line) => {
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
        }
        catch (err) {
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
 */
function compileFile(inputPath, outputPath) {
    const fs = require("fs");
    const source = fs.readFileSync(inputPath, "utf-8");
    const compiled = compile(source);
    fs.writeFileSync(outputPath, compiled, "utf-8");
    console.log(`Compiled ${inputPath} to ${outputPath}`);
}
/* If executed directly (e.g., `node dist/index.js`) compile ./src/index.tuff to ./src/index.js
   Pass --repl as a CLI argument to start the REPL instead */
if (typeof module !== "undefined" &&
    module &&
    require &&
    require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes("--repl")) {
        startRepl();
    }
    else {
        compileFile("./src/main.tuff", "./src/main.js");
    }
}
