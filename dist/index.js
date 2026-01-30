"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compile = compile;
exports.interpret = interpret;
exports.startRepl = startRepl;
exports.compileFile = compileFile;
const readline_1 = __importDefault(require("readline"));
// Type ranges for validation
const typeRanges = {
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
function compile(input) {
    let trimmed = input.trim();
    // Validate and strip type annotations (e.g., 100U8 -> 100, 42I32 -> 42)
    trimmed = trimmed.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, (match, value, type) => {
        const num = parseInt(value, 10);
        const range = typeRanges[type];
        if (!range) {
            throw new Error(`Unknown type: ${type}`);
        }
        // Check for underflow or overflow
        if (num < range.min) {
            throw new Error(`Underflow: ${num} is below minimum for ${type} (${range.min})`);
        }
        if (num > range.max) {
            throw new Error(`Overflow: ${num} is above maximum for ${type} (${range.max})`);
        }
        return value;
    });
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
    const rl = readline_1.default.createInterface({
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
 * Wraps the output in an IIFE with process.exit.
 */
function compileFile(inputPath, outputPath) {
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
