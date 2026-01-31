"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLetDeclaration = parseLetDeclaration;
exports.buildBlockReturn = buildBlockReturn;
exports.extractParamNames = extractParamNames;
exports.buildFunctionBody = buildFunctionBody;
exports.buildFunctionBodyWithThisCapture = buildFunctionBodyWithThisCapture;
exports.convertLetBindingToIIFE = convertLetBindingToIIFE;
const compiler_1 = require("./compiler");
const conversionUtils_1 = require("./conversionUtils");
function parseLetDeclaration(stmt, declaredVars, validateTypes) {
    const typePattern = /let\s+(\w+)\s*:\s*(\w+)\s*=\s*([\s\S]+)/;
    const noTypePattern = /let\s+(\w+)\s*=\s*([\s\S]+)/;
    let match = stmt.match(typePattern);
    const [varName, declType, value] = match
        ? [match[1], match[2], match[3]]
        : (() => {
            match = stmt.match(noTypePattern);
            return match ? [match[1], undefined, match[2]] : [null, null, null];
        })();
    if (!varName)
        return null;
    if (declaredVars.has(varName)) {
        throw new Error("Variable '" + varName + "' has already been declared in this block");
    }
    declaredVars.add(varName);
    const trimmedValue = value.trim().replace(/;$/, "");
    if (declType && validateTypes) {
        (0, compiler_1.extractAndValidateTypesInExpression)(trimmedValue, declType);
    }
    else if (!declType && validateTypes) {
        (0, compiler_1.inferTypeFromValue)(trimmedValue);
    }
    const cleanValue = trimmedValue.replace(/(\d+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
    return "let " + varName + " = " + cleanValue;
}
function normalizeDeclarations(declarations) {
    return declarations.map((decl) => {
        if (decl.startsWith("let ")) {
            const match = decl.match(/^let\s+(\w+)\s*=\s*([\s\S]+)$/);
            if (!match)
                return decl;
            const [, varName, value] = match;
            const normalizedValue = (0, conversionUtils_1.normalizeAndStripNumericTypes)(value.trim());
            return "let " + varName + " = " + normalizedValue;
        }
        return decl;
    });
}
function processStatementsBeforeLast(statements, declaredVarsSet) {
    const declarations = [];
    const declaredVars = [];
    const declaredFunctions = [];
    for (let i = 0; i < statements.length - 1; i++) {
        const stmt = statements[i];
        if (stmt.startsWith("let ")) {
            const decl = parseLetDeclaration(stmt, declaredVarsSet, false);
            if (decl) {
                declarations.push(decl);
                const varMatch = decl.match(/^let\s+(\w+)\s*=/);
                if (varMatch) {
                    declaredVars.push(varMatch[1]);
                }
            }
        }
        else if (stmt.trim().startsWith("fn ") ||
            stmt.trim().startsWith("function ")) {
            const cleaned = stmt.trim().replace(/;$/, "");
            declarations.push(cleaned);
            // Extract function name from "function <name>(...)"
            const fnMatch = cleaned.match(/^function\s+(\w+)\s*\(/);
            if (fnMatch) {
                declaredFunctions.push(fnMatch[1]);
            }
        }
        else {
            declarations.push((0, conversionUtils_1.normalizeAndStripNumericTypes)(stmt.trim().replace(/;$/, "")));
        }
    }
    return { declarations, declaredVars, declaredFunctions };
}
function processLastStatement(lastStatement) {
    const trimmed = lastStatement.trim();
    const isFnDeclaration = trimmed.startsWith("fn ") || trimmed.startsWith("function ");
    if (isFnDeclaration) {
        return {
            normalizedLastStatement: trimmed.replace(/;$/, ""),
            isFnDeclaration: true,
        };
    }
    return {
        normalizedLastStatement: (0, conversionUtils_1.normalizeAndStripNumericTypes)(trimmed.replace(/;$/, "")),
        isFnDeclaration: false,
    };
}
function buildBlockReturn(blockContent) {
    const statements = (0, compiler_1.splitBlockStatements)(blockContent);
    if (statements.length === 0) {
        return {
            declarations: [],
            returnExpr: "",
            declaredVars: [],
            declaredFunctions: [],
        };
    }
    const declaredVarsSet = new Set();
    const lastStatement = statements[statements.length - 1];
    const { declarations: stmtDecls, declaredVars, declaredFunctions, } = processStatementsBeforeLast(statements, declaredVarsSet);
    const { normalizedLastStatement, isFnDeclaration } = processLastStatement(lastStatement);
    const declarations = isFnDeclaration
        ? [...stmtDecls, normalizedLastStatement]
        : stmtDecls;
    const normalizedDeclarations = normalizeDeclarations(declarations);
    return {
        declarations: normalizedDeclarations,
        returnExpr: isFnDeclaration ? "" : normalizedLastStatement,
        declaredVars,
        declaredFunctions,
    };
}
function buildFunctionWithPrefix(declarations, returnExpr) {
    const bodyPrefix = declarations.join("; ");
    if (!returnExpr) {
        return bodyPrefix ? bodyPrefix + ";" : "";
    }
    return bodyPrefix + (bodyPrefix ? "; " : "") + "return " + returnExpr + ";";
}
function extractParamNames(params) {
    return params
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
}
function buildFunctionBody(blockContent) {
    const { declarations, returnExpr } = buildBlockReturn(blockContent);
    return buildFunctionWithPrefix(declarations, returnExpr);
}
function buildFunctionBodyWithThisCapture(blockContent, params, isNestedFunction = false) {
    const { declarations, returnExpr, declaredVars, declaredFunctions } = buildBlockReturn(blockContent);
    // If the return expression is "this", capture all variables (params + locals)
    if (returnExpr === "this") {
        const paramNames = extractParamNames(params);
        const allVars = [...paramNames, ...declaredVars, ...declaredFunctions];
        // For nested functions returning this, also capture parent's this
        if (isNestedFunction) {
            allVars.push("this");
        }
        const prefix = declarations.length > 0 ? declarations.join("; ") + "; " : "";
        // If function contains nested functions, create self-referencing object
        // so nested functions can access parent scope via this.this pattern
        if (declaredFunctions.length > 0) {
            if (allVars.length === 0) {
                return (prefix +
                    "let o = {}; o.this = o; return o;");
            }
            const properties = allVars.map((name) => name + ": " + name).join(", ");
            return (prefix +
                "let o = {" +
                properties +
                "}; o.this = o; return o;");
        }
        // Normal case: no nested functions
        if (allVars.length === 0) {
            return prefix + "return {};";
        }
        const properties = allVars.map((name) => name + ": " + name).join(", ");
        return prefix + "return {" + properties + "};";
    }
    // Otherwise use normal function body building
    return buildFunctionWithPrefix(declarations, returnExpr);
}
function convertLetBindingToIIFE(blockContent) {
    const { declarations, returnExpr } = buildBlockReturn(blockContent);
    if (!returnExpr)
        return "";
    const d = declarations.length > 0 ? declarations.join("; ") + "; " : "";
    return "(function() { " + d + "return " + returnExpr + "; })()";
}
