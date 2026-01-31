"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlockStatements = parseBlockStatements;
exports.splitBlockStatements = splitBlockStatements;
exports.processLetStatements = processLetStatements;
exports.validateAndStripTypeAnnotations = validateAndStripTypeAnnotations;
exports.validateExpressionResult = validateExpressionResult;
exports.inferBlockExpressionType = inferBlockExpressionType;
exports.extractAndValidateTypesInExpression = extractAndValidateTypesInExpression;
exports.inferTypeFromValue = inferTypeFromValue;
exports.parseLetStatement = parseLetStatement;
exports.determineAndValidateType = determineAndValidateType;
const types_1 = require("./types");
const stringState_1 = require("./stringState");
function createBlockScanState() {
    return {
        statements: [],
        current: "",
        stringState: { inString: null, escaped: false },
        parenDepth: 0,
        braceDepth: 0,
        bracketDepth: 0,
    };
}
function flushBlockStatement(state) {
    const trimmed = state.current.trim();
    if (trimmed.length > 0) {
        state.statements.push(trimmed);
    }
    state.current = "";
}
function trackBlockChar(state, ch) {
    if ((0, stringState_1.updateStringState)(ch, state.stringState)) {
        state.current += ch;
        return;
    }
    if (ch === "(")
        state.parenDepth++;
    if (ch === ")")
        state.parenDepth = Math.max(state.parenDepth - 1, 0);
    if (ch === "{")
        state.braceDepth++;
    if (ch === "}")
        state.braceDepth = Math.max(state.braceDepth - 1, 0);
    if (ch === "[")
        state.bracketDepth++;
    if (ch === "]")
        state.bracketDepth = Math.max(state.bracketDepth - 1, 0);
    const isTopLevel = state.parenDepth === 0 &&
        state.braceDepth === 0 &&
        state.bracketDepth === 0;
    if (ch === ";" && isTopLevel) {
        flushBlockStatement(state);
        return;
    }
    state.current += ch;
}
function splitBlockStatements(blockContent) {
    const state = createBlockScanState();
    for (let i = 0; i < blockContent.length; i++) {
        trackBlockChar(state, blockContent[i]);
    }
    flushBlockStatement(state);
    return state.statements;
}
function processLetStatements(statements, handler) {
    const variableTypes = {};
    for (let i = 0; i < statements.length - 1; i++) {
        const stmt = statements[i];
        if (stmt.startsWith("let ")) {
            const match = stmt.match(/let\s+(\w+)\s*:\s*(\w+)\s*=\s*([\s\S]+)/);
            if (match) {
                const [, varName, declType] = match;
                variableTypes[varName] = declType;
            }
            else {
                const untypedMatch = stmt.match(/let\s+(\w+)\s*=\s*([\s\S]+)/);
                if (untypedMatch) {
                    const [, varName] = untypedMatch;
                    variableTypes[varName] = "I32";
                }
            }
            handler(stmt, i);
        }
    }
    return variableTypes;
}
function extractVariableTypes(statements) {
    return processLetStatements(statements, () => {
        // No-op handler for just extracting types
    });
}
function parseBlockStatements(blockContent) {
    const statements = splitBlockStatements(blockContent);
    const variableTypes = extractVariableTypes(statements);
    const lastStatement = statements.length > 0 ? statements[statements.length - 1] : "";
    return { statements, variableTypes, lastStatement };
}
/** Validate type annotations and return used types. */
function validateAndStripTypeAnnotations(input) {
    const typesUsed = new Set();
    input.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, (match, value, type) => {
        const num = parseInt(value, 10);
        (0, types_1.validateInRange)(num, type);
        typesUsed.add(type);
        return match;
    });
    return typesUsed;
}
/** Validate expression evaluates within type range. */
function validateExpressionResult(expression, type) {
    try {
        const fn = new Function("return " + expression);
        const result = fn();
        (0, types_1.validateInRange)(result, type);
    }
    catch (err) {
        if (err instanceof Error &&
            (err.message.startsWith("Underflow:") ||
                err.message.startsWith("Overflow:"))) {
            throw err;
        }
    }
}
function inferBlockExpressionType(blockContent) {
    const { variableTypes, lastStatement } = parseBlockStatements(blockContent);
    if (!lastStatement) {
        return undefined;
    }
    for (const [varName, type] of Object.entries(variableTypes)) {
        const regex = new RegExp("\\b" + varName + "\\b");
        if (regex.test(lastStatement)) {
            return type;
        }
    }
    return inferTypeFromValue(lastStatement);
}
/** Extract and validate types in an expression against declared type. */
function extractAndValidateTypesInExpression(expression, declaredType) {
    const blockMatch = expression.match(/^\s*\{\s*([\s\S]*)\s*\}\s*$/);
    if (blockMatch) {
        const blockContent = blockMatch[1];
        const blockType = inferBlockExpressionType(blockContent);
        if (blockType && types_1.TYPE_ORDER[blockType] !== undefined) {
            (0, types_1.validateVariableTypeCompatibility)(blockType, declaredType);
        }
        return;
    }
    const typesUsed = new Set();
    expression.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, (match, value, type) => {
        typesUsed.add(type);
        return match;
    });
    if (typesUsed.size === 0) {
        return;
    }
    const maxUsedType = (0, types_1.getLargestUsedType)(typesUsed);
    if (!maxUsedType) {
        return;
    }
    if (types_1.TYPE_ORDER[maxUsedType] > types_1.TYPE_ORDER[declaredType]) {
        (0, types_1.throwTypeMismatchError)(maxUsedType, declaredType);
    }
}
function inferTypeFromValue(value) {
    const typesUsed = new Set();
    value.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, (match, _num, type) => {
        typesUsed.add(type);
        return match;
    });
    if (typesUsed.size === 0) {
        return undefined;
    }
    if (typesUsed.size > 1) {
        return (0, types_1.determineCoercedType)(Array.from(typesUsed));
    }
    return Array.from(typesUsed)[0];
}
function parseLetStatement(statement) {
    let letMatch = statement.match(/let\s+(mut\s+)?(\w+)\s*:\s*(\*?)(mut\s+)?(\w+)\s*=\s*([\s\S]+)/);
    if (letMatch) {
        const [, varMut, varName, pointerPrefix, typeMut, baseType, value] = letMatch;
        const declType = pointerPrefix + (typeMut ? "mut " : "") + baseType;
        const processedValue = value.trim().replace(/;$/, "");
        const isMutable = varMut !== undefined;
        return { varName, declType, value: processedValue, isMutable };
    }
    letMatch = statement.match(/let\s+(mut\s+)?(\w+)\s*=\s*([\s\S]+)/);
    if (letMatch) {
        const [, mutKeyword, varName, value] = letMatch;
        const trimmedValue = value.trim().replace(/;$/, "");
        const inferredType = inferTypeFromValue(trimmedValue);
        const declType = inferredType !== null && inferredType !== void 0 ? inferredType : "I32";
        const isMutable = mutKeyword !== undefined;
        return { varName, declType, value: trimmedValue, isMutable };
    }
    return null;
}
function determineAndValidateType(trimmed, typesUsed) {
    let resultType;
    if (typesUsed.size > 1) {
        const types = Array.from(typesUsed);
        resultType = (0, types_1.determineCoercedType)(types);
        if (!resultType) {
            const sorted = types.sort();
            throw new Error("Type mismatch: cannot mix " +
                sorted[0] +
                " and " +
                sorted[1] +
                " in arithmetic expression");
        }
    }
    else if (typesUsed.size === 1) {
        resultType = Array.from(typesUsed)[0];
    }
    if (resultType && resultType !== "F32" && resultType !== "F64") {
        validateExpressionResult(trimmed, resultType);
    }
}
