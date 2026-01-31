"use strict";
/** Utilities for handling struct definitions and instantiations. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStruct = registerStruct;
exports.getStructFields = getStructFields;
exports.handleStructInstantiation = handleStructInstantiation;
// Global registry to track struct field names
const structRegistry = new Map();
function registerStruct(structName, fields) {
    structRegistry.set(structName, fields);
}
function getStructFields(structName) {
    return structRegistry.get(structName);
}
function handleStructInstantiation(input) {
    const map = new Map();
    let i = 0;
    const result = input.replace(/([A-Z]\w*)\s*\{([^}]*)\}/g, (m, structName, values) => {
        const fields = getStructFields(structName);
        const valueList = values.split(",").map((v) => v.trim());
        let objectLit;
        if (fields && fields.length > 0) {
            // Map values to field names
            const pairs = fields.map((f, idx) => f + ": " + (valueList[idx] || valueList[0]));
            objectLit = "{" + pairs.join(", ") + "}";
        }
        else {
            // Fallback for unknown structs
            objectLit = "{field: " + valueList[0] + "}";
        }
        const k = "__STRUCT_" + i + "__";
        map.set(k, objectLit);
        i++;
        return k;
    });
    return [result, map];
}
