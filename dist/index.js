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
// Type families for organization
const TYPE_FAMILIES = {
    unsignedInts: ["U8", "U16", "U32", "U64"],
    signedInts: ["I8", "I16", "I32", "I64"],
    floats: ["F32", "F64"],
};
/**
 * Strip brace-wrapped expressions, treating { ... } as a grouping operator.
 * Also handles `let` variable bindings within blocks.
 * Recursively removes braces from the inner-most expressions outward.
 * For example: { 5 } → 5, (2 + { 3 }) → (2 + 3)
 * Variable bindings: { let x : U8 = 3; x } → (function() { let x = 3; return x; })()
 */
function stripBraceWrappers(input) {
    let result = input;
    const iifeMap = new Map();
    let iifeCounter = 0;
    let changed = true;
    while (changed) {
        changed = false;
        // Match { ... } patterns where inside contains no braces (innermost first)
        // Using [\s\S] instead of . to match across newlines, and [^{}]+ to exclude braces
        const newResult = result.replace(/\{([\s\S]*?)\}/g, (match, inside) => {
            // Check if this has nested braces
            if (inside.includes("{") || inside.includes("}")) {
                return match; // Skip, process inner braces first
            }
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
 * Validate a let statement and extract its declaration.
 * Returns the declaration string or null if invalid.
 */
function parseLetDeclaration(stmt, declaredVars, validateTypes) {
    const letMatch = stmt.match(/let\s+(\w+)\s*:\s*(\w+)\s*=\s*([\s\S]+)/);
    if (!letMatch) {
        return null;
    }
    const [, varName, declType, value] = letMatch;
    // Check for duplicate variable declaration
    if (declaredVars.has(varName)) {
        throw new Error(`Variable '${varName}' has already been declared in this block`);
    }
    declaredVars.add(varName);
    // Validate types in the assigned expression if requested
    if (validateTypes) {
        extractAndValidateTypesInExpression(value, declType);
    }
    // Strip type annotations from the value
    const cleanValue = value.replace(/(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
    return `let ${varName} = ${cleanValue}`;
}
/**
 * Convert a let binding block to a JavaScript IIFE.
 * For example: 'let x : U8 = 3; x' → '(function() { let x = 3; return x; })()'
 */
function convertLetBindingToIIFE(blockContent) {
    // Split by semicolon to separate statements
    const statements = blockContent
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (statements.length === 0) {
        return "";
    }
    // Process each statement except the last
    const declarations = [];
    const declaredVars = new Set();
    const lastStatement = statements[statements.length - 1];
    for (let i = 0; i < statements.length - 1; i++) {
        const stmt = statements[i];
        if (stmt.startsWith("let ")) {
            const decl = parseLetDeclaration(stmt, declaredVars, true);
            if (decl) {
                declarations.push(decl);
            }
        }
    }
    // Build the IIFE
    const functionBody = declarations.join("; ") +
        (declarations.length > 0 ? "; " : "") +
        `return ${lastStatement};`;
    return `(function() { ${functionBody} })()`;
}
/**
 * Determine the largest type used, ensuring all types are in the same family.
 * Returns the largest type or undefined if types are from different families.
 */
function getLargestUsedType(typesUsed) {
    const types = Array.from(typesUsed);
    if (types.every((t) => TYPE_FAMILIES.unsignedInts.includes(t))) {
        return findLargestType(types, TYPE_FAMILIES.unsignedInts);
    }
    else if (types.every((t) => TYPE_FAMILIES.signedInts.includes(t))) {
        return findLargestType(types, TYPE_FAMILIES.signedInts);
    }
    else if (types.every((t) => TYPE_FAMILIES.floats.includes(t))) {
        return types.includes("F64") ? "F64" : "F32";
    }
    return undefined;
}
/**
 * Extract types used in an expression and validate against declared type.
 */
function extractAndValidateTypesInExpression(expression, declaredType) {
    const typeOrder = {
        U8: 1,
        U16: 2,
        U32: 3,
        U64: 4,
        I8: 1,
        I16: 2,
        I32: 3,
        I64: 4,
        F32: 5,
        F64: 6,
    };
    const typesUsed = new Set();
    expression.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, (match, value, type) => {
        typesUsed.add(type);
        return match;
    });
    // If no explicit types in the expression, it's OK
    if (typesUsed.size === 0) {
        return;
    }
    const maxUsedType = getLargestUsedType(typesUsed);
    if (!maxUsedType) {
        return; // Mixed families - already validated elsewhere
    }
    // Check if max used type fits into declared type
    if (typeOrder[maxUsedType] > typeOrder[declaredType]) {
        throw new Error(`Type mismatch: cannot assign ${maxUsedType} to ${declaredType}`);
    }
}
/**
 * Extract top-level let statements from input and return {declarations, expression}.
 * Handles multiline declarations and braces properly.
 * For example: 'let x : U8 = 5; x + 1' → {declarations: ['let x = 5'], expression: 'x + 1'}
 */
function extractTopLevelStatements(input) {
    const declarations = [];
    let remaining = input.trim();
    // Extract all top-level let statements
    while (remaining.startsWith("let ")) {
        // Find the semicolon that ends this let statement, accounting for braces
        let semiIdx = -1;
        let braceDepth = 0;
        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i] === "{")
                braceDepth++;
            else if (remaining[i] === "}")
                braceDepth--;
            else if (remaining[i] === ";" && braceDepth === 0) {
                semiIdx = i;
                break;
            }
        }
        if (semiIdx === -1) {
            break; // No semicolon found at brace depth 0, treat rest as expression
        }
        const statement = remaining.substring(0, semiIdx);
        remaining = remaining.substring(semiIdx + 1).trim();
        // Parse: let identifier : type = value (using [\s\S] to match across newlines)
        const letMatch = statement.match(/let\s+(\w+)\s*:\s*(\w+)\s*=\s*([\s\S]+)/);
        if (letMatch) {
            const [, varName, declType, value] = letMatch;
            let cleanValue = value.trim().replace(/;$/, "");
            // Validate types in the assigned expression
            extractAndValidateTypesInExpression(cleanValue, declType);
            // Strip type annotations from literals in the value
            cleanValue = cleanValue.replace(/(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
            declarations.push(`let ${varName} = ${cleanValue}`);
        }
    }
    return { declarations, expression: remaining };
}
/**
 * Process top-level declarations by stripping braces and type annotations.
 */
function processDeclarations(rawDeclarations) {
    const declarations = [];
    for (const decl of rawDeclarations) {
        // Remove "let " prefix and split to get var name and value (using [\s\S] to match across newlines)
        const declMatch = decl.match(/let\s+(\w+)\s*=\s*([\s\S]+)/);
        if (declMatch) {
            const [, varName, value] = declMatch;
            let processedValue = value.trim();
            // Strip brace-wrapped expressions
            processedValue = stripBraceWrappers(processedValue);
            // Strip type annotations
            processedValue = processedValue.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
            declarations.push(`let ${varName} = ${processedValue}`);
        }
    }
    return declarations;
}
/**
 * Determine the result type and validate expression.
 */
function determineAndValidateType(trimmed, typesUsed) {
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
}
/**
 * Compile Tuff source code to JavaScript.
 * Currently treats expressions as implicit return values.
 * Handles top-level variable declarations.
 * Strips type annotations like U8, U16, I32, etc.
 * Strips brace-wrapped expressions (block expressions).
 * Validates that numeric values are within the range of their type annotation.
 */
function compile(input) {
    const { declarations: rawDeclarations, expression: rawExpression } = extractTopLevelStatements(input);
    // Process declarations to strip braces and type annotations
    const declarations = processDeclarations(rawDeclarations);
    let trimmed = rawExpression.trim();
    // Strip brace-wrapped expressions { ... }
    trimmed = stripBraceWrappers(trimmed);
    const typesUsed = validateAndStripTypeAnnotations(trimmed);
    trimmed = trimmed.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
    // Determine result type and validate
    determineAndValidateType(trimmed, typesUsed);
    // Build the compiled code
    let compiled = "";
    if (declarations.length > 0) {
        compiled += declarations.join(";\n") + ";\n";
    }
    // If it doesn't start with "return ", wrap it in a return statement
    if (!trimmed.startsWith("return ")) {
        compiled += `return ${trimmed};`;
    }
    else {
        compiled += trimmed;
    }
    return compiled;
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
    // Check if all types are in the same family
    const allUnsigned = types.every((t) => TYPE_FAMILIES.unsignedInts.includes(t));
    const allSigned = types.every((t) => TYPE_FAMILIES.signedInts.includes(t));
    const allFloats = types.every((t) => TYPE_FAMILIES.floats.includes(t));
    if (!allUnsigned && !allSigned && !allFloats) {
        return undefined; // Incompatible types
    }
    // Find the largest type in the family
    if (allUnsigned) {
        return findLargestType(types, TYPE_FAMILIES.unsignedInts);
    }
    if (allSigned) {
        return findLargestType(types, TYPE_FAMILIES.signedInts);
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
