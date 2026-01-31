"use strict";
/** Utilities for tracking function signatures and parameter types. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFunction = registerFunction;
exports.getFunctionParameters = getFunctionParameters;
exports.extractArrayDimensions = extractArrayDimensions;
exports.validateArgumentType = validateArgumentType;
// Global registry to track function signatures
const functionRegistry = new Map();
function registerFunction(fnName, parameters) {
    functionRegistry.set(fnName, parameters);
}
function getFunctionParameters(fnName) {
    return functionRegistry.get(fnName);
}
/**
 * Extract array dimensions from an array type string.
 * Returns [elementType, initCount, capacity] for types like "[I32; 1; 3]"
 * Returns undefined if not an array type.
 */
function extractArrayDimensions(type) {
    const match = type.match(/^\[(\w+);\s*(\d+);\s*(\d+)\]$/);
    if (!match) {
        return undefined;
    }
    const [, elementType, initStr, capacityStr] = match;
    const initCount = parseInt(initStr, 10);
    const capacity = parseInt(capacityStr, 10);
    return [elementType, initCount, capacity];
}
/**
 * Validate that an argument type matches a parameter type.
 * For array types, checks that dimensions are compatible.
 */
function validateArgumentType(argumentType, parameterType) {
    const paramDims = extractArrayDimensions(parameterType);
    const argDims = extractArrayDimensions(argumentType);
    if (paramDims && argDims) {
        const [paramElem, paramInit, paramCap] = paramDims;
        const [argElem, argInit, argCap] = argDims;
        // Element types must match
        if (paramElem !== argElem) {
            throw new Error("Type mismatch: argument element type " +
                argElem +
                " does not match parameter element type " +
                paramElem);
        }
        // Initialized count must be sufficient
        if (argInit < paramInit) {
            throw new Error("Type mismatch: argument array has " +
                argInit +
                " initialized elements, but parameter requires at least " +
                paramInit);
        }
        // Capacity must match exactly - this is a hard requirement
        if (argCap !== paramCap) {
            throw new Error("Type mismatch: argument array capacity " +
                argCap +
                " does not match parameter capacity " +
                paramCap);
        }
    }
    else if (paramDims !== argDims) {
        // One is an array type and the other is not
        throw new Error("Type mismatch: argument type " +
            argumentType +
            " does not match parameter type " +
            parameterType);
    }
}
