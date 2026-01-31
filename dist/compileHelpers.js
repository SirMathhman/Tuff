"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAndStripNumericTypes = exports.convertThisTypeVarProperty = exports.convertThisProperty = exports.stripComments = exports.convertPointerDereference = exports.convertMutableReference = exports.convertCharLiteralsToUTF8 = exports.stripNumericTypeSuffixes = void 0;
exports.parseIfExpression = parseIfExpression;
exports.parseIfStatement = parseIfStatement;
exports.parseWhileStatement = parseWhileStatement;
exports.normalizeExpression = normalizeExpression;
exports.extractParameterInfo = extractParameterInfo;
exports.parseStructDefinition = parseStructDefinition;
exports.parseFunctionDeclaration = parseFunctionDeclaration;
const stringState_1 = require("./stringState");
const structUtils_1 = require("./structUtils");
const blockUtils_1 = require("./blockUtils");
const parseHelpers_1 = require("./parseHelpers");
// Re-export conversion utilities
var conversionUtils_1 = require("./conversionUtils");
Object.defineProperty(exports, "stripNumericTypeSuffixes", { enumerable: true, get: function () { return conversionUtils_1.stripNumericTypeSuffixes; } });
Object.defineProperty(exports, "convertCharLiteralsToUTF8", { enumerable: true, get: function () { return conversionUtils_1.convertCharLiteralsToUTF8; } });
Object.defineProperty(exports, "convertMutableReference", { enumerable: true, get: function () { return conversionUtils_1.convertMutableReference; } });
Object.defineProperty(exports, "convertPointerDereference", { enumerable: true, get: function () { return conversionUtils_1.convertPointerDereference; } });
Object.defineProperty(exports, "stripComments", { enumerable: true, get: function () { return conversionUtils_1.stripComments; } });
Object.defineProperty(exports, "convertThisProperty", { enumerable: true, get: function () { return conversionUtils_1.convertThisProperty; } });
Object.defineProperty(exports, "convertThisTypeVarProperty", { enumerable: true, get: function () { return conversionUtils_1.convertThisTypeVarProperty; } });
Object.defineProperty(exports, "normalizeAndStripNumericTypes", { enumerable: true, get: function () { return conversionUtils_1.normalizeAndStripNumericTypes; } });
/** Strip brace-wrapped expressions and convert let bindings to IIFEs. */
function stripBraceWrappers(input) {
    let result = input;
    const iifeMap = new Map();
    let iifeCounter = 0;
    let changed = true;
    while (changed) {
        changed = false;
        const newResult = result.replace(/\{([\s\S]*?)\}/g, (match, inside) => {
            if (inside.includes("{") || inside.includes("}"))
                return match;
            changed = true;
            inside = inside.trim();
            if (inside.includes(";")) {
                const iife = (0, blockUtils_1.convertLetBindingToIIFE)(inside);
                const placeholder = "__IIFE_" + iifeCounter + "__";
                iifeMap.set(placeholder, iife);
                iifeCounter++;
                return placeholder;
            }
            return inside;
        });
        result = newResult;
    }
    // Clean up leading/trailing whitespace that may result from empty block replacement
    result = result.replace(/^\s+/, "").replace(/\s+$/, "");
    for (const [placeholder, iife] of iifeMap) {
        result = result.split(placeholder).join(iife);
    }
    return result;
}
function scanExpression(input, start, options) {
    var _a;
    const stringState = { inString: null, escaped: false };
    const depthState = { paren: 0, brace: 0, bracket: 0 };
    for (let i = start; i < input.length; i++) {
        const ch = input[i];
        if ((0, stringState_1.updateStringState)(ch, stringState)) {
            continue;
        }
        const depthResult = (0, parseHelpers_1.updateDepthState)(ch, depthState, options.stopTokens);
        if (depthResult.stop) {
            return { expr: input.slice(start, i).trim(), end: i };
        }
        if (depthResult.handled) {
            continue;
        }
        if ((0, parseHelpers_1.isAtTopLevel)(depthState)) {
            if (options.stopOnElse && (0, parseHelpers_1.isKeywordAt)(input, i, "else")) {
                return { expr: input.slice(start, i).trim(), end: i };
            }
            if ((_a = options.stopTokens) === null || _a === void 0 ? void 0 : _a.includes(ch)) {
                return { expr: input.slice(start, i).trim(), end: i };
            }
        }
    }
    return { expr: input.slice(start).trim(), end: input.length };
}
function parseIfBranch(input, start, options) {
    let idx = start;
    while (idx < input.length && /\s/.test(input[idx]))
        idx++;
    if (input[idx] === "{") {
        const balanced = (0, parseHelpers_1.readBalanced)(input, idx, "{", "}");
        if (balanced) {
            return { expr: "{" + balanced.content + "}", end: balanced.end };
        }
    }
    return scanExpression(input, idx, {
        stopOnElse: options.stopOnElse,
        stopTokens: [";", ")", "}", "]", ","],
    });
}
function parseConditionAfterKeyword(input, start, keywordLength) {
    let idx = start + keywordLength;
    while (idx < input.length && /\s/.test(input[idx]))
        idx++;
    const condition = (0, parseHelpers_1.readBalanced)(input, idx, "(", ")");
    if (!condition)
        return null;
    const conditionExpr = condition.content.trim();
    return { conditionExpr, end: condition.end };
}
function parseIfConditionAndThen(input, start) {
    if (!(0, parseHelpers_1.isKeywordAt)(input, start, "if"))
        return null;
    const conditionResult = parseConditionAfterKeyword(input, start, 2);
    if (!conditionResult)
        return null;
    let idx = conditionResult.end;
    const conditionExpr = conditionResult.conditionExpr;
    const thenResult = parseIfBranch(input, idx, { stopOnElse: true });
    idx = thenResult.end;
    return { conditionExpr, thenResult, idx };
}
function parseElseClause(input, idx) {
    while (idx < input.length && /\s/.test(input[idx]))
        idx++;
    if (!(0, parseHelpers_1.isKeywordAt)(input, idx, "else"))
        return null;
    idx += 4;
    const elseResult = parseIfBranch(input, idx, { stopOnElse: false });
    return { elseResult, idx: elseResult.end };
}
function parseIfExpression(input, start) {
    const parsed = parseIfConditionAndThen(input, start);
    if (!parsed)
        return null;
    const elseClause = parseElseClause(input, parsed.idx);
    if (!elseClause)
        return null;
    const thenExpr = transformIfExpressions(parsed.thenResult.expr);
    const elseExpr = transformIfExpressions(elseClause.elseResult.expr);
    const replacement = "(" + parsed.conditionExpr + " ? " + thenExpr + " : " + elseExpr + ")";
    return { replacement, end: elseClause.idx };
}
function parseIfStatement(input, start) {
    const parsed = parseIfConditionAndThen(input, start);
    if (!parsed)
        return null;
    let idx = parsed.idx;
    let elseStatement = "";
    const elseClause = parseElseClause(input, idx);
    if (elseClause) {
        const elseBody = transformIfExpressions(elseClause.elseResult.expr);
        elseStatement = " else " + elseBody;
        idx = elseClause.idx;
    }
    const thenBody = transformIfExpressions(parsed.thenResult.expr);
    const statement = "if (" + parsed.conditionExpr + ") " + thenBody + elseStatement;
    return { statement, end: idx };
}
function parseWhileStatement(input, start) {
    if (!(0, parseHelpers_1.isKeywordAt)(input, start, "while"))
        return null;
    const conditionResult = parseConditionAfterKeyword(input, start, 5);
    if (!conditionResult)
        return null;
    let idx = conditionResult.end;
    const conditionExpr = conditionResult.conditionExpr;
    while (idx < input.length && /\s/.test(input[idx]))
        idx++;
    const bodyResult = (0, parseHelpers_1.readBalanced)(input, idx, "{", "}");
    if (!bodyResult)
        return null;
    const body = transformIfExpressions(bodyResult.content);
    const statement = "while (" + conditionExpr + ") {" + body + "}";
    return { statement, end: bodyResult.end };
}
function transformIfExpressions(input) {
    let result = "";
    let i = 0;
    while (i < input.length) {
        if ((0, parseHelpers_1.isKeywordAt)(input, i, "if")) {
            const parsed = parseIfExpression(input, i);
            if (parsed) {
                result += parsed.replacement;
                i = parsed.end;
                continue;
            }
        }
        result += input[i];
        i++;
    }
    return result;
}
function normalizeExpression(input) {
    const [p, m] = (0, structUtils_1.handleStructInstantiation)(input);
    let r = stripBraceWrappers(transformIfExpressions(p));
    for (const [k, v] of m)
        r = r.split(k).join(v);
    return r;
}
function normalizeParamList(paramList) {
    const trimmed = paramList.trim();
    if (!trimmed)
        return "";
    return trimmed
        .split(",")
        .map((param) => {
        const nameMatch = param.trim().match(/^([A-Za-z_]\w*)/);
        return nameMatch ? nameMatch[1] : "";
    })
        .filter((name) => name.length > 0)
        .join(", ");
}
/**
 * Extract parameter information with full type details.
 * Returns array of {name, type} objects from parameter list like "x : I32, arr : [I32; 1; 3]"
 */
function extractParameterInfo(paramList) {
    const trimmed = paramList.trim();
    if (!trimmed)
        return [];
    const params = [];
    const paramParts = trimmed.split(",");
    for (const param of paramParts) {
        const trimmedParam = param.trim();
        const colonIdx = trimmedParam.indexOf(":");
        if (colonIdx !== -1) {
            const name = trimmedParam.substring(0, colonIdx).trim();
            const type = trimmedParam.substring(colonIdx + 1).trim();
            if (name && type) {
                params.push({ name, type });
            }
        }
        else {
            // No type annotation, try to extract just the name
            const nameMatch = trimmedParam.match(/^([A-Za-z_]\w*)/);
            if (nameMatch) {
                params.push({ name: nameMatch[1], type: "I32" }); // default to I32
            }
        }
    }
    return params;
}
function parseFunctionBody(input, idx) {
    // Check if body is braced or a bare expression
    if (input[idx] === "{") {
        const bodyResult = (0, parseHelpers_1.readBalanced)(input, idx, "{", "}");
        if (!bodyResult)
            return null;
        return { content: bodyResult.content, end: bodyResult.end };
    }
    // Handle bare expression body - read until semicolon
    let semiIdx = input.indexOf(";", idx);
    if (semiIdx === -1) {
        semiIdx = input.length;
    }
    const content = input.substring(idx, semiIdx).trim();
    return { content, end: semiIdx };
}
function parseStructDefinition(input, start) {
    if (!(0, parseHelpers_1.isKeywordAt)(input, start, "struct"))
        return null;
    let idx = (0, parseHelpers_1.skipWhitespace)(input, start + 6);
    const nameResult = (0, parseHelpers_1.readIdentifier)(input, idx);
    if (!nameResult)
        return null;
    idx = (0, parseHelpers_1.skipWhitespace)(input, nameResult.end);
    const bodyResult = (0, parseHelpers_1.readBalanced)(input, idx, "{", "}");
    if (!bodyResult)
        return null;
    idx = bodyResult.end;
    const fields = bodyResult.content
        .trim()
        .split(";")
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .map((f) => f.substring(0, f.indexOf(":")).trim());
    if (input[idx] === ";")
        idx++;
    return { end: idx, name: nameResult.name, fields };
}
function processNestedFunctionDeclarations(content) {
    let result = content;
    let pos = 0;
    while (pos < result.length) {
        const remaining = result.substring(pos);
        const fnIndex = remaining.indexOf("fn ");
        if (fnIndex === -1)
            break;
        const fnStart = pos + fnIndex;
        // Check if this is actually a function declaration at word boundary
        if (fnStart > 0) {
            const charBefore = result[fnStart - 1];
            if (/[a-zA-Z0-9_]/.test(charBefore)) {
                pos = fnStart + 3;
                continue;
            }
        }
        // Try to parse as function declaration
        const parsed = parseFunctionDeclaration(result, fnStart, true);
        if (parsed) {
            // Replace the Tuff function declaration with JavaScript
            const before = result.substring(0, fnStart);
            const after = result.substring(parsed.end);
            // Add semicolon after declaration to ensure proper statement separation
            result = before + parsed.declaration + "; " + after;
            pos = fnStart + parsed.declaration.length + 2; // +2 for "; "
        }
        else {
            pos = fnStart + 3;
        }
    }
    return result;
}
function buildThisCaptureBody(params) {
    const paramNames = (0, blockUtils_1.extractParamNames)(params);
    if (paramNames.length === 0) {
        return "return {};";
    }
    const properties = paramNames.map((name) => name + ": " + name).join(", ");
    return "return {" + properties + "};";
}
function parseFunctionSignature(input, start) {
    if (!(0, parseHelpers_1.isKeywordAt)(input, start, "fn"))
        return null;
    let idx = (0, parseHelpers_1.skipWhitespace)(input, start + 2);
    const nameResult = (0, parseHelpers_1.readIdentifier)(input, idx);
    if (!nameResult)
        return null;
    const fnName = nameResult.name;
    idx = (0, parseHelpers_1.skipWhitespace)(input, nameResult.end);
    const paramsResult = (0, parseHelpers_1.readBalanced)(input, idx, "(", ")");
    if (!paramsResult)
        return null;
    const rawParams = paramsResult.content;
    const params = normalizeParamList(rawParams);
    idx = (0, parseHelpers_1.skipWhitespace)(input, paramsResult.end);
    if (input[idx] === ":") {
        idx = (0, parseHelpers_1.skipWhitespace)(input, idx + 1);
        const typeResult = (0, parseHelpers_1.readIdentifier)(input, idx);
        if (typeResult) {
            idx = (0, parseHelpers_1.skipWhitespace)(input, typeResult.end);
        }
    }
    if (input.slice(idx, idx + 2) !== "=>")
        return null;
    idx = (0, parseHelpers_1.skipWhitespace)(input, idx + 2);
    return { fnName, params, rawParams, idx };
}
function buildFunctionBodyCode(trimmedBody, bodyResult, sig, isNestedFunction) {
    const isBlockBody = bodyResult.content.trim().startsWith("{") ||
        bodyResult.content.includes(";") ||
        trimmedBody.includes("fn ") ||
        trimmedBody.includes("let ");
    const processedBody = processNestedFunctionDeclarations(bodyResult.content);
    if (trimmedBody === "this") {
        return buildThisCaptureBody(sig.params);
    }
    if (isBlockBody) {
        const { returnExpr } = (0, blockUtils_1.buildBlockReturn)(processedBody);
        if (returnExpr === "this") {
            return (0, blockUtils_1.buildFunctionBodyWithThisCapture)(processedBody, sig.params, isNestedFunction);
        }
        return (0, blockUtils_1.buildFunctionBody)(processedBody, sig.params);
    }
    return (0, blockUtils_1.buildFunctionBody)(processedBody, sig.params);
}
function parseFunctionDeclaration(input, start, isNestedFunction = false) {
    const sig = parseFunctionSignature(input, start);
    if (!sig)
        return null;
    const bodyResult = parseFunctionBody(input, sig.idx);
    if (!bodyResult)
        return null;
    const trimmedBody = bodyResult.content.trim();
    const functionBody = buildFunctionBodyCode(trimmedBody, bodyResult, sig, isNestedFunction);
    const declaration = "function " + sig.fnName + "(" + sig.params + ") { " + functionBody + " }";
    return {
        declaration,
        end: bodyResult.end,
        fnName: sig.fnName,
        rawParams: sig.rawParams,
    };
}
