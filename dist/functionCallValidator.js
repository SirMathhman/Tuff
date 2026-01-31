"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFunctionCalls = validateFunctionCalls;
const functionRegistry_1 = require("./functionRegistry");
/** Validate function calls in an expression against registered function signatures. */
function validateFunctionCalls(expression, variableTypes) {
    // Match function calls: fnName(argName) or fnName(arg1, arg2, ...)
    const functionCallRegex = /(\w+)\s*\(\s*(\w+)\s*\)/g;
    let match;
    while ((match = functionCallRegex.exec(expression)) !== null) {
        const fnName = match[1];
        const argName = match[2];
        // Get registered function parameters
        const paramInfo = (0, functionRegistry_1.getFunctionParameters)(fnName);
        if (!paramInfo) {
            continue; // Function not registered, skip validation
        }
        // Get the type of the argument
        const argType = variableTypes[argName];
        if (!argType) {
            continue; // Argument type not tracked, skip validation
        }
        // Get the expected parameter type
        if (paramInfo.length > 0) {
            const expectedParamType = paramInfo[0].type;
            (0, functionRegistry_1.validateArgumentType)(argType, expectedParamType);
        }
    }
}
