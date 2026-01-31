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
function findFunctionCallMatch(content, i, fnName) {
    const nameIsAtBoundary = (i === 0 || !/[a-zA-Z0-9_.]/.test(content[i - 1])) &&
        (i + fnName.length >= content.length ||
            !/[a-zA-Z0-9_]/.test(content[i + fnName.length]));
    if (!nameIsAtBoundary) {
        return { foundCall: false };
    }
    let j = i + fnName.length;
    while (j < content.length && /\s/.test(content[j]))
        j++;
    if (j >= content.length || content[j] !== "(") {
        return { foundCall: false };
    }
    // Check if this is a function DECLARATION
    let k = i - 1;
    while (k >= 0 && /\s/.test(content[k]))
        k--;
    const isFunctionDeclaration = content
        .slice(Math.max(0, k - 7), k + 1)
        .endsWith("function");
    if (isFunctionDeclaration) {
        return { foundCall: false };
    }
    // Extract arguments
    j++;
    let parenDepth = 1;
    let args = "";
    while (j < content.length && parenDepth > 0) {
        if (content[j] === "(")
            parenDepth++;
        else if (content[j] === ")")
            parenDepth--;
        if (parenDepth > 0) {
            args += content[j];
        }
        j++;
    }
    return { foundCall: true, endPos: j, args };
}
function rewriteNestedFunctionCallsWithScopeVar(content, functionNames) {
    var _a;
    if (functionNames.length === 0) {
        return content;
    }
    let result = "";
    let i = 0;
    while (i < content.length) {
        let matched = false;
        for (const fnName of functionNames) {
            const match = findFunctionCallMatch(content, i, fnName);
            if (match.foundCall) {
                result += fnName + ".call(__scope";
                if ((_a = match.args) === null || _a === void 0 ? void 0 : _a.trim()) {
                    result += ", " + match.args;
                }
                result += ")";
                i = match.endPos || i + fnName.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            result += content[i];
            i++;
        }
    }
    return result;
}
function buildFunctionBody(blockContent, params = "") {
    const { declarations, returnExpr, declaredFunctions } = buildBlockReturn(blockContent);
    // If function has nested functions, rewrite their calls to propagate scope
    if (declaredFunctions.length > 0) {
        const paramNames = extractParamNames(params);
        // Always use __scope for nested function calls
        const rewrittenExpr = rewriteNestedFunctionCallsWithScopeVar(returnExpr, declaredFunctions);
        const rewrittenDeclarations = declarations.map((decl) => {
            return rewriteNestedFunctionCallsWithScopeVar(decl, declaredFunctions);
        });
        if (paramNames.length > 0) {
            // Function has parameters - create __scope with parameter captures
            return buildFunctionWithScope(rewrittenDeclarations, rewrittenExpr, params);
        }
        else {
            // Function has no parameters - create __scope that chains to parent
            return buildFunctionWithParentScope(rewrittenDeclarations, rewrittenExpr);
        }
    }
    return buildFunctionWithPrefix(declarations, returnExpr);
}
function buildFunctionWithScope(declarations, returnExpr, params) {
    const declarationStr = declarations.join("; ");
    const paramNames = extractParamNames(params);
    // Create self-referential __scope to support nested function chains
    const paramAssignments = paramNames
        .map((p) => "__scope." + p + " = " + p)
        .join("; ");
    const prefix = "let __scope = {this: null}; __scope.this = __scope; " +
        (paramAssignments ? paramAssignments + "; " : "") +
        declarationStr +
        (declarationStr ? "; " : "");
    if (!returnExpr) {
        return prefix;
    }
    return prefix + "return " + returnExpr + ";";
}
function buildFunctionWithParentScope(declarations, returnExpr) {
    const declarationStr = declarations.join("; ");
    const prefix = "let __scope = {this: this}; " +
        declarationStr +
        (declarationStr ? "; " : "");
    if (!returnExpr) {
        return prefix;
    }
    return prefix + "return " + returnExpr + ";";
}
function buildSelfReferencingThisReturn(properties) {
    if (properties.length === 0) {
        return "let o = {}; o.this = o; return o;";
    }
    const props = properties.map((name) => name + ": " + name).join(", ");
    return "let o = {" + props + "}; o.this = o; return o;";
}
function buildRegularThisReturn(properties) {
    if (properties.length === 0) {
        return "return {};";
    }
    const props = properties.map((name) => name + ": " + name).join(", ");
    return "return {" + props + "};";
}
function buildFunctionBodyWithThisCapture(blockContent, params, isNestedFunction = false) {
    const { declarations, returnExpr, declaredVars, declaredFunctions } = buildBlockReturn(blockContent);
    if (returnExpr !== "this") {
        return buildFunctionWithPrefix(declarations, returnExpr);
    }
    const prefix = declarations.length > 0 ? declarations.join("; ") + "; " : "";
    const paramNames = extractParamNames(params);
    const allVars = [...paramNames, ...declaredVars, ...declaredFunctions];
    if (isNestedFunction) {
        allVars.push("this");
    }
    if (declaredFunctions.length > 0) {
        return prefix + buildSelfReferencingThisReturn(allVars);
    }
    return prefix + buildRegularThisReturn(allVars);
}
function convertLetBindingToIIFE(blockContent) {
    const { declarations, returnExpr } = buildBlockReturn(blockContent);
    if (!returnExpr)
        return "";
    const d = declarations.length > 0 ? declarations.join("; ") + "; " : "";
    return "(function() { " + d + "return " + returnExpr + "; })()";
}
