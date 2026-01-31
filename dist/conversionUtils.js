"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripNumericTypeSuffixes = stripNumericTypeSuffixes;
exports.convertCharLiteralsToUTF8 = convertCharLiteralsToUTF8;
exports.convertMutableReference = convertMutableReference;
exports.convertPointerDereference = convertPointerDereference;
exports.stripComments = stripComments;
exports.convertThisProperty = convertThisProperty;
exports.convertThisTypeVarProperty = convertThisTypeVarProperty;
exports.convertArrayLiterals = convertArrayLiterals;
exports.normalizeAndStripNumericTypes = normalizeAndStripNumericTypes;
const compileHelpers_1 = require("./compileHelpers");
function stripNumericTypeSuffixes(input) {
    return input.replace(/(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g, "$1");
}
function convertCharLiteralsToUTF8(input) {
    return input.replace(/'(.)'/g, (match, char) => {
        return String(char.charCodeAt(0));
    });
}
function convertMutableReference(input) {
    // Convert &mut identifier to {value: identifier}
    return input.replace(/&mut\s+([a-zA-Z_][a-zA-Z0-9_]*)/g, "{value: $1}");
}
function convertPointerDereference(input) {
    // Convert *identifier to identifier.value
    // Match * followed by an identifier (word characters)
    // Use negative lookbehind to avoid matching multiplication operators
    // that come after numbers or identifiers
    return input.replace(/(?<![a-zA-Z0-9_])\*([a-zA-Z_][a-zA-Z0-9_]*)/g, "$1.value");
}
function stripComments(input) {
    return input
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*?(?=\r\n|\n|$)/g, "");
}
function convertThisProperty(input) {
    // Convert this.property to just property
    return input.replace(/this\.([a-zA-Z_][a-zA-Z0-9_]*)/g, "$1");
}
function convertThisTypeVarProperty(input, thisTypeVars) {
    // Convert varName.property to just property when varName is a This-typed variable
    let result = input;
    for (const varName of thisTypeVars) {
        const regex = new RegExp("\\b" + varName + "\\.([a-zA-Z_][a-zA-Z0-9_]*)", "g");
        result = result.replace(regex, "$1");
    }
    return result;
}
function convertArrayLiterals(input) {
    // Convert Tuff array literals [val1, val2, ...] to JavaScript arrays
    // This is a simple passthrough as JavaScript array syntax is the same
    // but we preserve it so it's not treated as a block
    return input;
}
function normalizeAndStripNumericTypes(input) {
    return convertCharLiteralsToUTF8(stripNumericTypeSuffixes((0, compileHelpers_1.normalizeExpression)(input)));
}
