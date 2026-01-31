"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TYPE_FAMILIES = exports.TYPE_ORDER = exports.typeRanges = void 0;
exports.throwTypeMismatchError = throwTypeMismatchError;
exports.getLargestUsedType = getLargestUsedType;
exports.validateInRange = validateInRange;
exports.validateVariableTypeCompatibility = validateVariableTypeCompatibility;
exports.determineCoercedType = determineCoercedType;
// Type ranges for validation
exports.typeRanges = {
    U8: { min: 0, max: 255 },
    U16: { min: 0, max: 65535 },
    U32: { min: 0, max: 4294967295 },
    U64: { min: 0, max: 18446744073709551615 },
    I8: { min: -128, max: 127 },
    I16: { min: -32768, max: 32767 },
    I32: { min: -2147483648, max: 2147483647 },
    I64: { min: -9223372036854775808, max: 9223372036854775807 },
    F32: { min: -3.4e38, max: 3.4e38 },
    F64: { min: -1.7976931348623157e308, max: 1.7976931348623157e308 },
};
exports.TYPE_ORDER = {
    U8: 0,
    U16: 1,
    U32: 2,
    U64: 3,
    I8: 0,
    I16: 1,
    I32: 2,
    I64: 3,
    F32: 0,
    F64: 1,
};
exports.TYPE_FAMILIES = {
    unsignedInts: ["U8", "U16", "U32", "U64"],
    signedInts: ["I8", "I16", "I32", "I64"],
    floats: ["F32", "F64"],
};
/** Throw a type mismatch error. */
function throwTypeMismatchError(sourceType, targetType) {
    throw new Error("Type mismatch: cannot assign " + sourceType + " to " + targetType);
}
/** Find the largest type in the same family. */
function getLargestUsedType(typesUsed) {
    const types = Array.from(typesUsed);
    if (types.every((t) => exports.TYPE_FAMILIES.unsignedInts.includes(t))) {
        return findLargestType(types, exports.TYPE_FAMILIES.unsignedInts);
    }
    else if (types.every((t) => exports.TYPE_FAMILIES.signedInts.includes(t))) {
        return findLargestType(types, exports.TYPE_FAMILIES.signedInts);
    }
    else if (types.every((t) => exports.TYPE_FAMILIES.floats.includes(t))) {
        return types.includes("F64") ? "F64" : "F32";
    }
    return undefined;
}
/** Check if a numeric value is within the type range. */
function validateInRange(value, type) {
    const range = exports.typeRanges[type];
    if (!range) {
        throw new Error("Unknown type: " + type);
    }
    if (value < range.min) {
        throw new Error("Underflow: " +
            value +
            " is below minimum for " +
            type +
            " (" +
            range.min +
            ")");
    }
    if (value > range.max) {
        throw new Error("Overflow: " +
            value +
            " is above maximum for " +
            type +
            " (" +
            range.max +
            ")");
    }
}
/** Validate variable type compatibility. */
function validateVariableTypeCompatibility(sourceType, targetType) {
    const sourcePriority = exports.TYPE_ORDER[sourceType];
    const targetPriority = exports.TYPE_ORDER[targetType];
    if (sourcePriority === undefined || targetPriority === undefined) {
        return;
    }
    const sameFamily = (exports.TYPE_FAMILIES.unsignedInts.includes(sourceType) &&
        exports.TYPE_FAMILIES.unsignedInts.includes(targetType)) ||
        (exports.TYPE_FAMILIES.signedInts.includes(sourceType) &&
            exports.TYPE_FAMILIES.signedInts.includes(targetType)) ||
        (exports.TYPE_FAMILIES.floats.includes(sourceType) &&
            exports.TYPE_FAMILIES.floats.includes(targetType));
    if (!sameFamily) {
        throwTypeMismatchError(sourceType, targetType);
    }
    if (sourcePriority > targetPriority) {
        throwTypeMismatchError(sourceType, targetType);
    }
}
function findLargestType(types, order) {
    return types.reduce((max, current) => order.indexOf(current) > order.indexOf(max) ? current : max);
}
function determineCoercedType(types) {
    const allUnsigned = types.every((t) => exports.TYPE_FAMILIES.unsignedInts.includes(t));
    const allSigned = types.every((t) => exports.TYPE_FAMILIES.signedInts.includes(t));
    const allFloats = types.every((t) => exports.TYPE_FAMILIES.floats.includes(t));
    if (!allUnsigned && !allSigned && !allFloats) {
        return undefined;
    }
    if (allUnsigned) {
        return findLargestType(types, exports.TYPE_FAMILIES.unsignedInts);
    }
    else if (allSigned) {
        return findLargestType(types, exports.TYPE_FAMILIES.signedInts);
    }
    else {
        return types.includes("F64") ? "F64" : "F32";
    }
}
