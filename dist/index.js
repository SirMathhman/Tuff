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
    const typesUsed = validateAndStripTypeAnnotations(trimmed);
    trimmed = trimmed.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
    // Determine result type and validate
    let resultType;
    if (typesUsed.size > 1) {
        const types = Array.from(typesUsed);
        resultType = determineCoercedType(types);
        if (!resultType) {
            // Types are incompatible
            const sorted = types.sort();
            throw new Error(`Type mismatch: cannot mix ${sorted[0]} and ${sorted[1]} in arithmetic expression`);
        }
    }
    else if (typesUsed.size === 1) {
        resultType = Array.from(typesUsed)[0];
    }
    // Validate result at compile time for non-float types
    if (resultType && resultType !== "F32" && resultType !== "F64") {
        validateExpressionResult(trimmed, resultType);
    }
    // If it doesn't contain return, wrap it in a return statement
    if (!trimmed.includes("return")) {
        return `return ${trimmed};`;
    }
    return trimmed;
}
/**
 * Check if a numeric value is within the range of its type.
 * Throws an error if the value is outside the range.
 */
function validateInRange(value, type) {
    const range = typeRanges[type];
    if (!range) {
        throw new Error(`Unknown type: ${type}`);
    }
    if (value < range.min) {
        throw new Error(`Underflow: ${value} is below minimum for ${type} (${range.min})`);
    }
    if (value > range.max) {
        throw new Error(`Overflow: ${value} is above maximum for ${type} (${range.max})`);
    }
}
/**
 * Validate type annotations in the input and return the set of types used.
 * Throws errors for underflow/overflow violations.
 */
function validateAndStripTypeAnnotations(input) {
    const typesUsed = new Set();
    input.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, (match, value, type) => {
        const num = parseInt(value, 10);
        validateInRange(num, type);
        typesUsed.add(type);
        return match;
    });
    return typesUsed;
}
/**
 * Validate that an expression evaluates to a value within the given type's range.
 * Throws an error if the result overflows or underflows the type.
 */
function validateExpressionResult(expression, type) {
    try {
        const fn = new Function(`return ${expression}`);
        const result = fn();
        validateInRange(result, type);
    }
    catch (err) {
        // If it's our underflow/overflow error, rethrow; otherwise continue compilation
        if (err instanceof Error &&
            (err.message.startsWith("Underflow:") ||
                err.message.startsWith("Overflow:"))) {
            throw err;
        }
    }
}
/**
 * Find the largest type in a family of types based on the given order.
 */
function findLargestType(types, order) {
    return types.reduce((max, current) => order.indexOf(current) > order.indexOf(max) ? current : max);
}
/**
 * Determine the coerced type for a set of types.
 * Returns the coerced type if types are compatible, undefined otherwise.
 */
function determineCoercedType(types) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = require("fs");
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
}
else {
    compileFile("./src/main.tuff", "./src/main.js");
}
