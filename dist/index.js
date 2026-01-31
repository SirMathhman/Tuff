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
const types_1 = require("./types");
const compiler_1 = require("./compiler");
const compileHelpers_1 = require("./compileHelpers");
const structUtils_1 = require("./structUtils");
function extractSingleLetStatement(statement) {
    const parsed = (0, compiler_1.parseLetStatement)(statement);
    if (!parsed) {
        return null;
    }
    const { varName, declType, value, isMutable } = parsed;
    (0, compiler_1.extractAndValidateTypesInExpression)(value, declType);
    const cleanValue = value.replace(/(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
    return { varName, declType, cleanValue, isMutable };
}
function findVariableReference(varNames, value) {
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
function processSingleLetInTopLevel(statement, variableTypes, mutableVars, thisTypeVars) {
    const extracted = extractSingleLetStatement(statement);
    if (!extracted) {
        return null;
    }
    const { varName, declType, cleanValue, isMutable } = extracted;
    // Track if this is a This type
    if (declType === "This") {
        thisTypeVars.add(varName);
    }
    const referencedVar = findVariableReference(Object.keys(variableTypes), cleanValue);
    if (referencedVar) {
        const referencedType = variableTypes[referencedVar];
        (0, types_1.validateVariableTypeCompatibility)(referencedType, declType);
    }
    variableTypes[varName] = declType;
    if (isMutable) {
        mutableVars.add(varName);
    }
    // If declaring a pointer type, wrap the value in an object
    // But don't wrap if value already contains &mut (will be wrapped by reference)
    const containsMutRef = /&mut\s+/.test(cleanValue);
    const alreadyWrapped = /^\{value:\s*/.test(cleanValue);
    const finalValue = declType.startsWith("*") && !alreadyWrapped && !containsMutRef
        ? "{value: " + cleanValue + "}"
        : cleanValue;
    return { varName, cleanValue: finalValue };
}
function findNextSemicolon(remaining) {
    let semiIdx = -1;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;
    for (let i = 0; i < remaining.length; i++) {
        if (remaining[i] === "{")
            braceDepth++;
        else if (remaining[i] === "}")
            braceDepth--;
        else if (remaining[i] === "[")
            bracketDepth++;
        else if (remaining[i] === "]")
            bracketDepth--;
        else if (remaining[i] === "(")
            parenDepth++;
        else if (remaining[i] === ")")
            parenDepth--;
        else if (remaining[i] === ";" &&
            braceDepth === 0 &&
            bracketDepth === 0 &&
            parenDepth === 0) {
            semiIdx = i;
            break;
        }
    }
    return semiIdx;
}
function processAssignmentStatement(statement, mutableVars) {
    let varName;
    let lhs;
    let operator;
    let value;
    // Handle this.varName assignments
    const thisAssignMatch = statement.match(/^this\.\s*(\w+)\s*((?:[+\-*/%&|^])?=)\s*([\s\S]+)$/);
    if (thisAssignMatch) {
        [, varName, operator, value] = thisAssignMatch;
        lhs = varName;
    }
    else {
        // Handle array/subscript assignments and regular varName assignments
        const assignMatch = statement.match(/^(\w+(?:\[[^\]]*\])*)\s*((?:[+\-*/%&|^])?=)\s*([\s\S]+)$/);
        if (!assignMatch) {
            return "";
        }
        [, lhs, operator, value] = assignMatch;
        // Extract base variable name from lhs for mutability check
        const baseVarMatch = lhs.match(/^(\w+)/);
        varName = baseVarMatch ? baseVarMatch[1] : lhs;
    }
    if (!mutableVars.has(varName)) {
        throw new Error("Cannot assign to immutable variable '" +
            varName +
            "'. Declare it with 'let mut' to allow reassignment.");
    }
    const processedValue = (0, compileHelpers_1.normalizeAndStripNumericTypes)(value.trim());
    return lhs + " " + operator + " " + processedValue;
}
function advancePastDefinition(remaining, end) {
    let newRemaining = remaining.substring(end).trim();
    if (newRemaining.startsWith(";")) {
        newRemaining = newRemaining.substring(1).trim();
    }
    return newRemaining;
}
function processFnDeclaration(remaining, declarations) {
    const parsedFn = (0, compileHelpers_1.parseFunctionDeclaration)(remaining, 0);
    if (!parsedFn) {
        return remaining;
    }
    declarations.push(parsedFn.declaration);
    return advancePastDefinition(remaining, parsedFn.end);
}
function processStructDefinition(remaining) {
    const parsedStruct = (0, compileHelpers_1.parseStructDefinition)(remaining, 0);
    if (!parsedStruct) {
        return remaining;
    }
    (0, structUtils_1.registerStruct)(parsedStruct.name, parsedStruct.fields);
    return advancePastDefinition(remaining, parsedStruct.end);
}
function findNextBlockEnd(input, start) {
    if (input[start] !== "{")
        return -1;
    let depth = 1;
    let i = start + 1;
    while (i < input.length && depth > 0) {
        if (input[i] === "{")
            depth++;
        else if (input[i] === "}")
            depth--;
        i++;
    }
    return depth === 0 ? i - 1 : -1;
}
function processStatement(statement, context) {
    if (statement.startsWith("let ")) {
        const processed = processSingleLetInTopLevel(statement, context.variableTypes, context.mutableVars, context.thisTypeVars);
        if (processed) {
            context.declarations.push("let " + processed.varName + " = " + processed.cleanValue);
        }
    }
    else if (statement.trim().length > 0) {
        const assignStmt = processAssignmentStatement(statement, context.mutableVars);
        if (assignStmt) {
            context.declarations.push(assignStmt);
        }
    }
}
function processBlockStatements(blockContent, context) {
    const { statements } = (0, compiler_1.parseBlockStatements)(blockContent);
    for (const stmt of statements) {
        processStatement(stmt, context);
    }
}
function handleTopLevelStatement(statement, context) {
    processStatement(statement, context);
}
function handleTopLevelIf(remaining, declarations) {
    if (!remaining.startsWith("if"))
        return null;
    // First try to parse as a statement (with or without else)
    const parsedStmt = (0, compileHelpers_1.parseIfStatement)(remaining, 0);
    if (parsedStmt) {
        const afterIf = remaining.substring(parsedStmt.end).trim();
        // If there's more code after the if statement, treat it as a statement
        if (afterIf.length > 0 && !afterIf.startsWith(";")) {
            declarations.push(parsedStmt.statement);
            return afterIf;
        }
    }
    // Otherwise try as an expression (requires else clause)
    const parsedIf = (0, compileHelpers_1.parseIfExpression)(remaining, 0);
    if (parsedIf) {
        const afterIf = remaining.substring(parsedIf.end).trim();
        if (afterIf.length > 0 && !afterIf.startsWith(";")) {
            declarations.push(parsedIf.replacement);
            return afterIf;
        }
    }
    return null;
}
function handleTopLevelWhile(remaining, declarations) {
    if (!remaining.startsWith("while"))
        return null;
    const parsedStmt = (0, compileHelpers_1.parseWhileStatement)(remaining, 0);
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
function handleTopLevelBlock(remaining, variableTypes, mutableVars, declarations, thisTypeVars) {
    if (!remaining.startsWith("{"))
        return null;
    const blockEndIdx = findNextBlockEnd(remaining, 0);
    if (blockEndIdx !== -1) {
        const afterBlock = remaining.substring(blockEndIdx + 1).trim();
        if (afterBlock.length > 0 && !afterBlock.startsWith(";")) {
            const context = {
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
function isTopLevelTrigger(remaining) {
    return (remaining.startsWith("let ") ||
        remaining.startsWith("fn ") ||
        remaining.startsWith("struct ") ||
        remaining.startsWith("{") ||
        remaining.startsWith("if") ||
        remaining.startsWith("while") ||
        remaining.startsWith("this.") ||
        /^\w+(?:\[[^\]]*\])*\s*(?:[+\-*/%&|^])?=\s*/.test(remaining));
}
function tryHandleControlFlow(remaining, declarations, variableTypes, mutableVars, thisTypeVars) {
    if (remaining.startsWith("fn ")) {
        return processFnDeclaration(remaining, declarations);
    }
    if (remaining.startsWith("struct ")) {
        return processStructDefinition(remaining);
    }
    const ifResult = handleTopLevelIf(remaining, declarations);
    if (ifResult !== null)
        return ifResult;
    const whileResult = handleTopLevelWhile(remaining, declarations);
    if (whileResult !== null)
        return whileResult;
    const blockResult = handleTopLevelBlock(remaining, variableTypes, mutableVars, declarations, thisTypeVars);
    if (blockResult !== null)
        return blockResult;
    return null;
}
function extractTopLevelStatements(input) {
    const declarations = [];
    const variableTypes = {};
    const mutableVars = new Set();
    const thisTypeVars = new Set();
    let remaining = input.trim();
    while (isTopLevelTrigger(remaining)) {
        const controlFlowResult = tryHandleControlFlow(remaining, declarations, variableTypes, mutableVars, thisTypeVars);
        if (controlFlowResult !== null) {
            remaining = controlFlowResult;
            continue;
        }
        const semiIdx = findNextSemicolon(remaining);
        if (semiIdx === -1)
            break;
        const context = {
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
function processDeclarations(rawDeclarations) {
    const declarations = [];
    for (const decl of rawDeclarations) {
        const declMatch = decl.match(/^let\s+(\w+)\s*=\s*([\s\S]+)$/);
        if (declMatch) {
            const [, varName, value] = declMatch;
            // Convert &mut references first
            const refConverted = (0, compileHelpers_1.convertMutableReference)(value.trim());
            // Skip normalization for pointer wrapper objects {value: ...}
            const isPointerWrapper = /^\{value:\s*/.test(refConverted);
            const processedValue = isPointerWrapper
                ? refConverted
                : (0, compileHelpers_1.normalizeAndStripNumericTypes)(refConverted);
            declarations.push("let " + varName + " = " + processedValue);
        }
        else if (decl.trim().startsWith("function ")) {
            // Don't normalize function declarations - push as-is
            declarations.push(decl.trim());
        }
        else if (decl.trim().length > 0) {
            declarations.push((0, compileHelpers_1.normalizeAndStripNumericTypes)(decl));
        }
    }
    return declarations;
}
function compile(input) {
    // Strip comments before processing
    const cleanedInput = (0, compileHelpers_1.stripComments)(input);
    const { declarations: rawDeclarations, expression: rawExpression, thisTypeVars, } = extractTopLevelStatements(cleanedInput);
    const declarations = processDeclarations(rawDeclarations);
    let trimmed = (0, compileHelpers_1.normalizeExpression)(rawExpression.trim());
    const typesUsed = (0, compiler_1.validateAndStripTypeAnnotations)(trimmed);
    trimmed = (0, compileHelpers_1.convertThisTypeVarProperty)((0, compileHelpers_1.convertThisProperty)((0, compileHelpers_1.convertPointerDereference)((0, compileHelpers_1.convertCharLiteralsToUTF8)((0, compileHelpers_1.stripNumericTypeSuffixes)(trimmed)))), thisTypeVars);
    if (trimmed === "") {
        trimmed = "0";
    }
    (0, compiler_1.determineAndValidateType)(trimmed, typesUsed);
    let compiled = "";
    if (declarations.length > 0) {
        compiled += declarations.join(";\n") + ";\n";
    }
    if (!trimmed.startsWith("return ")) {
        compiled += "return " + trimmed + ";";
    }
    else {
        compiled += trimmed;
    }
    return compiled;
}
function interpret(source) {
    const js = compile(source);
    return evaluate(js);
}
function evaluate(bundledJs) {
    const fn = new Function(bundledJs);
    const result = fn();
    return Number(result);
}
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
function compileFile(inputPath, outputPath) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = require("fs");
    const source = fs.readFileSync(inputPath, "utf-8");
    const compiled = compile(source);
    const wrapped = "process.exit(Number((function() {\n  " + compiled + "\n})()));";
    fs.writeFileSync(outputPath, wrapped, "utf-8");
    console.log("Compiled " + inputPath + " to " + outputPath);
}
const args = process.argv.slice(2);
if (args.includes("--repl")) {
    startRepl();
}
else {
    compileFile("./src/main.tuff", "./src/main.js");
}
