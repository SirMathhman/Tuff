"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpret = interpret;
var RANGES = {
    U8: { min: 0n, max: 255n },
    U16: { min: 0n, max: 65535n },
    U32: { min: 0n, max: 4294967295n },
    U64: { min: 0n, max: 18446744073709551615n },
    I8: { min: -128n, max: 127n },
    I16: { min: -32768n, max: 32767n },
    I32: { min: -2147483648n, max: 2147483647n },
    I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};
var YieldSignal = /** @class */ (function () {
    function YieldSignal(value) {
        this.value = value;
    }
    return YieldSignal;
}());
var ReturnSignal = /** @class */ (function () {
    function ReturnSignal(value) {
        this.value = value;
    }
    return ReturnSignal;
}());
function getFromScope(scope, name) {
    if (name in scope.values)
        return scope.values[name];
    if (scope.parent)
        return getFromScope(scope.parent, name);
    return undefined;
}
function updateInScope(scope, name, val) {
    if (name in scope.values || !scope.parent) {
        scope.values[name] = val;
    }
    else {
        updateInScope(scope.parent, name, val);
    }
}
function getStructFromScope(scope, name) {
    if (scope.structs && name in scope.structs)
        return scope.structs[name];
    if (scope.parent)
        return getStructFromScope(scope.parent, name);
    return undefined;
}
function getTypeAliasFromScope(scope, name) {
    if (scope.typeAliases && name in scope.typeAliases)
        return scope.typeAliases[name];
    if (scope.parent)
        return getTypeAliasFromScope(scope.parent, name);
    return undefined;
}
function getFunctionFromScope(scope, name) {
    if (scope.functions && name in scope.functions)
        return scope.functions[name];
    if (scope.parent)
        return getFunctionFromScope(scope.parent, name);
    return undefined;
}
function resolveTypeAlias(type, scope) {
    var resolved = getTypeAliasFromScope(scope, type);
    if (resolved) {
        // For union types, recursively resolve each component
        if (resolved.includes("|")) {
            var components = resolved.split("|").map(function (t) {
                var trimmed = t.trim();
                return resolveTypeAlias(trimmed, scope);
            });
            return components.join("|");
        }
        return resolveTypeAlias(resolved, scope);
    }
    return type;
}
function checkValueAgainstUnion(value, valueType, components) {
    for (var _i = 0, components_1 = components; _i < components_1.length; _i++) {
        var component = components_1[_i];
        if (valueType && valueType === component)
            return true;
        // For untyped values, check if it fits in component's range
        if (!valueType) {
            var range = RANGES[component];
            if (range) {
                var bigVal = BigInt(Math.floor(value));
                if (bigVal >= range.min && bigVal <= range.max)
                    return true;
            }
        }
    }
    return false;
}
function valueMatchesType(value, valueType, targetType, scope) {
    // Resolve the valueType if it's an alias
    var resolvedValueType = valueType
        ? resolveTypeAlias(valueType, scope)
        : undefined;
    var resolvedTargetType = resolveTypeAlias(targetType, scope);
    // If valueType is a union and targetType is not, check if targetType is one of the union members
    if (resolvedValueType &&
        resolvedValueType.includes("|") &&
        !resolvedTargetType.includes("|")) {
        var components = resolvedValueType.split("|").map(function (t) { return t.trim(); });
        return components.includes(resolvedTargetType);
    }
    // If targetType is a union, check against all components
    if (resolvedTargetType.includes("|")) {
        var components = resolvedTargetType.split("|").map(function (t) { return t.trim(); });
        // If valueType is also a union, check if they're equivalent
        if (resolvedValueType && resolvedValueType.includes("|")) {
            var valueComponents = resolvedValueType.split("|").map(function (t) { return t.trim(); });
            // Check if all components match
            if (valueComponents.length === components.length) {
                var allMatch = true;
                for (var _i = 0, valueComponents_1 = valueComponents; _i < valueComponents_1.length; _i++) {
                    var vc = valueComponents_1[_i];
                    if (!components.includes(vc)) {
                        allMatch = false;
                        break;
                    }
                }
                if (allMatch)
                    return true;
            }
        }
        return checkValueAgainstUnion(value, resolvedValueType, components);
    }
    // Single type check
    if (resolvedValueType === resolvedTargetType)
        return true;
    // For untyped values, check range
    if (!resolvedValueType) {
        var range = RANGES[resolvedTargetType];
        if (range) {
            var bigVal = BigInt(Math.floor(value));
            return bigVal >= range.min && bigVal <= range.max;
        }
    }
    return false;
}
function parseTypeSuffix(numStr, rest, n) {
    if (rest.length === 0)
        return { value: n };
    if (rest === "bool")
        return { value: n, type: "Bool" };
    var sufMatch = rest.match(/^([uUiI])(8|16|32|64)(.*)$/);
    if (!sufMatch)
        return { value: n };
    var sign = sufMatch[1].toUpperCase();
    var bits = parseInt(sufMatch[2], 10);
    if (!/^[-+]?\d+$/.test(numStr)) {
        throw new Error("Integer required for integer type suffix");
    }
    var intVal = Number(numStr);
    var key = "".concat(sign).concat(bits);
    var range = RANGES[key];
    if (!range)
        return { value: n };
    var big = BigInt(intVal);
    if (big < range.min || big > range.max)
        throw new Error("".concat(key, " out of range"));
    if (bits === 64 &&
        (big > BigInt(Number.MAX_SAFE_INTEGER) ||
            big < BigInt(Number.MIN_SAFE_INTEGER))) {
        throw new Error("".concat(key, " value not representable as a JavaScript number"));
    }
    return { value: Number(intVal), type: key };
}
function parseToken(token, scope) {
    if (token.startsWith("!")) {
        var res = parseToken(token.slice(1), scope);
        return { value: res.value ? 0 : 1, type: "Bool" };
    }
    if (token === "true")
        return { value: 1, type: "Bool" };
    if (token === "false")
        return { value: 0, type: "Bool" };
    if (token.includes(".") && !/^[+-]?\d+\.\d+/.test(token)) {
        var parts = token.split(".");
        var obj = getFromScope(scope, parts[0]);
        if (!obj)
            throw new Error("Variable ".concat(parts[0], " not found"));
        if (typeof obj.value === "object" && obj.value !== null) {
            var current = obj.value;
            for (var i = 1; i < parts.length; i++) {
                if (typeof current !== "object" || current === null) {
                    throw new Error("Cannot access property ".concat(parts[i], " of non-object"));
                }
                current = current[parts[i]];
            }
            return { value: current };
        }
    }
    var inScope = getFromScope(scope, token);
    if (inScope)
        return inScope;
    var m = token.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!m)
        throw new Error("Invalid token: ".concat(token));
    var numStr = m[0];
    var n = parseFloat(numStr);
    if (Number.isNaN(n))
        throw new Error("Invalid number");
    var rest = token.slice(numStr.length);
    return parseTypeSuffix(numStr, rest, n);
}
function promoteTypes(type1, type2) {
    if (!type1 || type1 === "Bool")
        return type2;
    if (!type2 || type2 === "Bool")
        return type1;
    var r1 = RANGES[type1];
    var r2 = RANGES[type2];
    if (!r1)
        return type2;
    if (!r2)
        return type1;
    return r1.max >= r2.max ? type1 : type2;
}
function checkOverflow(value, type) {
    if (type && type !== "Bool") {
        var r = RANGES[type];
        if (!r)
            return;
        var big = BigInt(Math.floor(value));
        if (big < r.min || big > r.max)
            throw new Error("".concat(type, " overflow"));
    }
}
function applyOp(left, right, op) {
    var opMap = {
        "*": function (a, b) { return a * b; },
        "/": function (a, b) { return a / b; },
        "%": function (a, b) { return a % b; },
        "+": function (a, b) { return a + b; },
        "-": function (a, b) { return a - b; },
        "<": function (a, b) { return (a < b ? 1 : 0); },
        ">": function (a, b) { return (a > b ? 1 : 0); },
        "<=": function (a, b) { return (a <= b ? 1 : 0); },
        ">=": function (a, b) { return (a >= b ? 1 : 0); },
        "==": function (a, b) { return (a === b ? 1 : 0); },
        "!=": function (a, b) { return (a !== b ? 1 : 0); },
        "&&": function (a, b) { return (a && b ? 1 : 0); },
        "||": function (a, b) { return (a || b ? 1 : 0); },
    };
    if (!opMap[op])
        throw new Error("Unknown operator: ".concat(op));
    var type = promoteTypes(left.type, right.type);
    var res = opMap[op](left.value, right.value);
    if (["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(op)) {
        type = "Bool";
    }
    if (type !== "Bool")
        checkOverflow(res, type);
    return { value: res, type: type };
}
function evaluateExpression(s, tokens, scope) {
    var parsed = tokens.map(function (t) { return (__assign(__assign({}, parseToken(t.text, scope)), { text: t.text, index: t.index })); });
    var ops = [];
    for (var i = 1; i < parsed.length; i++) {
        var between = s.slice(parsed[i - 1].index + parsed[i - 1].text.length, parsed[i].index);
        var opMatch = between.match(/==|!=|<=|>=|&&|\|\||[+\-*/%<>]/);
        if (!opMatch)
            throw new Error("Invalid operator between operands. Expression: \"".concat(s, "\", between: \"").concat(between, "\", tokens: ").concat(tokens
                .map(function (t) { return "\"".concat(t.text, "\""); })
                .join(", ")));
        ops.push(opMatch[0]);
    }
    var values = parsed.map(function (p) { return ({
        value: p.value,
        type: p.type,
    }); });
    var currentOps = __spreadArray([], ops, true);
    var processPass = function (targetOps) {
        for (var i = 0; i < currentOps.length; i++) {
            if (targetOps.includes(currentOps[i])) {
                var res = applyOp(values[i], values[i + 1], currentOps[i]);
                values.splice(i, 2, res);
                currentOps.splice(i, 1);
                i--;
            }
        }
    };
    processPass(["*", "/", "%"]);
    processPass(["+", "-"]);
    processPass(["<", ">", "<=", ">="]);
    processPass(["==", "!="]);
    processPass(["&&"]);
    processPass(["||"]);
    return { value: values[0].value, type: values[0].type };
}
function validateTypeRange(targetRange, sourceRange, target, source, sourceType) {
    var noRanges = !targetRange || !sourceRange;
    var typeMismatch = noRanges ? target !== source : false;
    var outOfRange = targetRange && sourceRange
        ? targetRange.max < sourceRange.max || targetRange.min > sourceRange.min
        : false;
    if (typeMismatch || outOfRange) {
        throw new Error("Incompatible types: cannot implicitly convert ".concat(sourceType, " to ").concat(target));
    }
}
function checkTypeCompatibility(target, source, sourceType) {
    var targetRange = RANGES[target];
    var sourceRange = RANGES[source];
    validateTypeRange(targetRange, sourceRange, target, source, sourceType);
}
function checkNarrowing(targetType, sourceType) {
    // If target is a union type, check if source type is one of the union members
    if (targetType.includes("|")) {
        var components = targetType.split("|").map(function (t) { return t.trim(); });
        // For union types, require exact type match (no implicit conversion)
        for (var _i = 0, components_2 = components; _i < components_2.length; _i++) {
            var component = components_2[_i];
            if (component === sourceType) {
                return; // Found an exact match
            }
        }
        throw new Error("Incompatible types: ".concat(sourceType, " is not compatible with union ").concat(targetType));
    }
    // If source is a union type (but target is not), check if all union members are compatible
    if (sourceType.includes("|")) {
        var components = sourceType.split("|").map(function (t) { return t.trim(); });
        // All union members must be compatible with the target type
        for (var _a = 0, components_3 = components; _a < components_3.length; _a++) {
            var component = components_3[_a];
            checkTypeCompatibility(targetType, component, sourceType);
        }
        return; // All union members are compatible
    }
    // Single type narrowing check
    var target = RANGES[targetType];
    var source = RANGES[sourceType];
    validateTypeRange(target, source, targetType, sourceType, sourceType);
    // Check for narrowing specifically
    if (target &&
        source &&
        (target.max < source.max || target.min > source.min)) {
        throw new Error("Incompatible types: cannot implicitly narrow ".concat(sourceType, " to ").concat(targetType));
    }
}
function parseStructFields(fieldStr, scope
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    var fields = {};
    var fieldDecls = fieldStr.split(",").map(function (s) { return s.trim(); });
    for (var _i = 0, fieldDecls_1 = fieldDecls; _i < fieldDecls_1.length; _i++) {
        var decl = fieldDecls_1[_i];
        var parts = decl.split(":").map(function (s) { return s.trim(); });
        if (parts.length !== 2)
            throw new Error("Invalid field declaration: ".concat(decl));
        var fname = parts[0], fvalStr = parts[1];
        var fval = interpretRaw(fvalStr, scope);
        fields[fname] = fval.value;
    }
    return fields;
}
function initializeStruct(name, structName, fieldStr, scope, mutable, localDecls) {
    var struct = getStructFromScope(scope, structName);
    if (!struct)
        throw new Error("Struct ".concat(structName, " not defined"));
    var fields = parseStructFields(fieldStr, scope);
    scope.values[name] = {
        value: fields,
        type: structName,
        mutable: mutable,
    };
    localDecls.add(name);
    return { value: fields };
}
function bindFunctionParameters(func, args, funcScope) {
    for (var i = 0; i < func.params.length; i++) {
        var param = func.params[i];
        var arg = args[i];
        // Type check the argument against the parameter type
        // Allow untyped numeric values to be coerced to the parameter type
        if (arg.type) {
            checkNarrowing(param.type, arg.type);
        }
        else {
            // For untyped values, check if they fit in the target type's range
            checkOverflow(arg.value, param.type);
        }
        funcScope.values[param.name] = {
            value: arg.value,
            type: param.type,
            mutable: false,
        };
    }
}
function handleFunctionCall(funcName, func, argsStr, scope) {
    var _a;
    // Parse arguments
    var args = [];
    if (argsStr.trim()) {
        var argExprs = argsStr.split(",").map(function (a) { return a.trim(); });
        for (var _i = 0, argExprs_1 = argExprs; _i < argExprs_1.length; _i++) {
            var argExpr = argExprs_1[_i];
            args.push(interpretRaw(argExpr, scope));
        }
    }
    // Validate argument count
    if (args.length !== func.params.length) {
        throw new Error("Function ".concat(funcName, " expects ").concat(func.params.length, " arguments, got ").concat(args.length));
    }
    // Create function scope with parameters
    var funcScope = {
        values: {},
        parent: scope,
    };
    bindFunctionParameters(func, args, funcScope);
    // Execute function body
    var result;
    try {
        result = interpretRaw(func.body, funcScope);
    }
    catch (e) {
        if (e instanceof ReturnSignal) {
            result = e.value;
        }
        else {
            throw e;
        }
    }
    // Type check the return value if a return type was specified
    if (func.returnType) {
        if (result.type) {
            checkNarrowing(func.returnType, result.type);
        }
        else {
            // For untyped values, check if they fit in the return type's range
            checkOverflow(result.value, func.returnType);
        }
    }
    return { value: result.value, type: (_a = func.returnType) !== null && _a !== void 0 ? _a : result.type };
}
function extractTypeAndExpr(st) {
    // Find the = sign that separates type/name from expression
    var eqPos = -1;
    var depth = 0;
    for (var i = st.length - 1; i >= 0; i--) {
        var char = st[i];
        // When going backward, we encounter closing brackets/braces/parens first
        if (char === ")" || char === "}" || char === "]")
            depth++;
        if (char === "(" || char === "{" || char === "[")
            depth--;
        // Look for = at depth 0, but not part of =>, ==, !=, +=, etc.
        if (char === "=" && depth === 0) {
            var nextChar = i + 1 < st.length ? st[i + 1] : "";
            var prevChar = i > 0 ? st[i - 1] : "";
            // Skip if it's part of =>, ==, !=, +=, -=, *=, /=, %=, >=, <=
            if (nextChar !== "=" &&
                nextChar !== ">" &&
                prevChar !== "=" &&
                prevChar !== "!" &&
                prevChar !== "+" &&
                prevChar !== "-" &&
                prevChar !== "*" &&
                prevChar !== "/" &&
                prevChar !== "%" &&
                prevChar !== ">" &&
                prevChar !== "<") {
                eqPos = i;
                break;
            }
        }
    }
    var typeAndName = st;
    var expr = null;
    if (eqPos !== -1) {
        typeAndName = st.slice(0, eqPos).trim();
        expr = st.slice(eqPos + 1).trim();
    }
    // Parse "let [mut] name [: type]"
    var m = typeAndName.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*(.+))?$/);
    if (!m)
        return null;
    var mutS = m[1], name = m[2], type = m[3];
    return { type: type || null, expr: expr, name: name, mutable: !!mutS };
}
function parseParameters(paramsStr) {
    return paramsStr
        .split(",")
        .filter(function (p) { return p.trim(); })
        .map(function (p) {
        var pMatch = p.trim().match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
        if (!pMatch)
            throw new Error("Invalid parameter: ".concat(p));
        return { name: pMatch[1], type: pMatch[2].trim() };
    });
}
function isArrayType(type) {
    // Check if type matches [ElementType; InitCount; TotalCount]
    return type ? /^\[.+;\s*\d+;\s*\d+\]$/.test(type) : false;
}
function parseArrayType(type) {
    var match = type.match(/^\[(.+);\s*(\d+);\s*(\d+)\]$/);
    if (!match)
        return null;
    return {
        elementType: match[1].trim(),
        initCount: parseInt(match[2], 10),
        totalCount: parseInt(match[3], 10),
    };
}
function parseArrayLiteral(expr, scope) {
    // Parse [1, 2, 3] or similar
    if (!expr.trim().startsWith("[") || !expr.trim().endsWith("]")) {
        throw new Error("Invalid array literal: ".concat(expr));
    }
    var inner = expr.trim().slice(1, -1);
    if (!inner.trim())
        return [];
    var elements = [];
    var current = "";
    var depth = 0;
    for (var i = 0; i < inner.length; i++) {
        var char = inner[i];
        if (char === "(" || char === "[" || char === "{") {
            depth++;
        }
        else if (char === ")" || char === "]" || char === "}") {
            depth--;
        }
        else if (char === "," && depth === 0) {
            var trimmed_1 = current.trim();
            if (trimmed_1) {
                elements.push(interpretRaw(trimmed_1, scope));
            }
            current = "";
            continue;
        }
        current += char;
    }
    var trimmed = current.trim();
    if (trimmed) {
        elements.push(interpretRaw(trimmed, scope));
    }
    return elements;
}
function isArrayLiteral(expr) {
    var trimmed = expr.trim();
    return trimmed.startsWith("[") && trimmed.endsWith("]");
}
function inferArrayTypeFromLiteral(expr, scope) {
    if (!isArrayLiteral(expr))
        return null;
    var elements = parseArrayLiteral(expr, scope);
    if (elements.length === 0)
        return null;
    // Use the type of the first element as the element type
    var elementType = elements[0].type || "I32";
    var count = elements.length;
    return { elementType: elementType, count: count };
}
function parseFunctionExpression(expr, scope, type) {
    // Parse the function definition - return type is optional
    var fnMatch = expr.match(/^fn\s+([a-zA-Z_]\w+)\s*\(([^)]*)\)(?:\s*:\s*([^=]+?))?\s*=>\s*(.+)$/);
    if (!fnMatch) {
        throw new Error("Invalid function expression: \"".concat(expr, "\""));
    }
    var fnName = fnMatch[1], paramsStr = fnMatch[2], returnType = fnMatch[3], body = fnMatch[4];
    var params = parseParameters(paramsStr);
    var func = {
        params: params,
        returnType: returnType ? returnType.trim() : null,
        body: body,
    };
    // Store the function in scope
    if (!scope.functions)
        scope.functions = {};
    scope.functions[fnName] = func;
    // Create a function reference value - we'll store the function name as the value
    return { value: fnName, type: type !== null && type !== void 0 ? type : undefined };
}
function findMatchingCloseParen(expr, startIdx) {
    if (startIdx === void 0) { startIdx = 0; }
    var parenDepth = 0;
    for (var i = startIdx; i < expr.length; i++) {
        if (expr[i] === "(")
            parenDepth++;
        if (expr[i] === ")") {
            parenDepth--;
            if (parenDepth === 0)
                return i;
        }
    }
    return -1;
}
function isArrowFunctionExpression(expr) {
    // Arrow function: (params) : returnType => body
    // Has opening paren, closing paren, and arrow
    if (!expr.trim().startsWith("("))
        return false;
    // Find matching closing paren
    var closeParenIdx = findMatchingCloseParen(expr);
    if (closeParenIdx === -1)
        return false;
    // Check what comes after: should have =>
    var rest = expr.slice(closeParenIdx + 1).trim();
    return rest.includes("=>");
}
function extractArrowFunctionParts(expr) {
    var closeParenIdx = findMatchingCloseParen(expr);
    if (closeParenIdx === -1 || !expr.startsWith("(")) {
        throw new Error("Invalid arrow function: \"".concat(expr, "\""));
    }
    var paramsStr = expr.slice(1, closeParenIdx);
    var rest = expr.slice(closeParenIdx + 1).trim();
    var arrowMatch = rest.match(/^\s*:\s*([^=]+)\s*=>\s*(.+)$/);
    if (!arrowMatch) {
        throw new Error("Invalid arrow function: \"".concat(expr, "\""));
    }
    var returnType = arrowMatch[1], body = arrowMatch[2];
    return { paramsStr: paramsStr, returnType: returnType.trim(), body: body };
}
function parseArrowFunctionExpression(expr, scope, type, varName) {
    // Parse arrow function: (params) : returnType => body
    var _a = extractArrowFunctionParts(expr), paramsStr = _a.paramsStr, returnType = _a.returnType, body = _a.body;
    var params = parseParameters(paramsStr);
    var func = {
        params: params,
        returnType: returnType,
        body: body,
    };
    // Store the function in scope with variable name as key
    if (!scope.functions)
        scope.functions = {};
    scope.functions[varName] = func;
    // Create a function reference value - we'll store the function name as the value
    return { value: varName, type: type !== null && type !== void 0 ? type : undefined };
}
function initializeArray(type, expr, scope) {
    var arrayType = parseArrayType(type);
    if (!arrayType)
        throw new Error("Invalid array type: ".concat(type));
    var elements = parseArrayLiteral(expr, scope);
    if (elements.length > arrayType.initCount) {
        throw new Error("Too many elements: expected ".concat(arrayType.initCount, ", got ").concat(elements.length));
    }
    // Store array as object with elements and metadata
    return {
        value: {
            elements: elements,
            elementType: arrayType.elementType,
            initCount: arrayType.initCount,
            totalCount: arrayType.totalCount,
        },
        type: "[".concat(arrayType.elementType, "; ").concat(arrayType.initCount, "; ").concat(arrayType.totalCount, "]"),
    };
}
function evaluateLetExpr(type, expr, name, scope) {
    // Special handling for arrays with explicit type
    if (isArrayType(type)) {
        return initializeArray(type, expr, scope);
    }
    // Special handling for implicit array literals (no type annotation)
    if (!type && isArrayLiteral(expr)) {
        var inferred = inferArrayTypeFromLiteral(expr, scope);
        return inferred
            ? initializeArray("[".concat(inferred.elementType, "; ").concat(inferred.count, "; ").concat(inferred.count, "]"), expr, scope)
            : interpretRaw(expr, scope);
    }
    if (expr.startsWith("fn ")) {
        return parseFunctionExpression(expr, scope, type);
    }
    if (isArrowFunctionExpression(expr)) {
        return parseArrowFunctionExpression(expr, scope, type, name);
    }
    // Default: interpret as expression
    var res = interpretRaw(expr, scope);
    var resolvedType = type ? resolveTypeAlias(type, scope) : type;
    if (resolvedType && res.type)
        checkNarrowing(resolvedType, res.type);
    return res;
}
function handleLet(st, scope, localDecls) {
    // Check for struct initialization first
    var structInit = st.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w+)\s*\{(.+)\}$/);
    if (structInit) {
        var mutS = structInit[1], name_1 = structInit[2], structName = structInit[3], fieldStr = structInit[4];
        return initializeStruct(name_1, structName, fieldStr, scope, !!mutS, localDecls);
    }
    // Parse using new function that handles complex types
    var parsed = extractTypeAndExpr(st);
    if (!parsed) {
        throw new Error("Invalid let declaration");
    }
    var type = parsed.type, expr = parsed.expr, name = parsed.name, mutable = parsed.mutable;
    if (localDecls.has(name)) {
        throw new Error("Variable already declared in this scope: ".concat(name));
    }
    var res = expr
        ? evaluateLetExpr(type, expr, name, scope)
        : { value: 0, type: type !== null && type !== void 0 ? type : undefined };
    var resolvedType = type ? resolveTypeAlias(type, scope) : type;
    var finalType = resolvedType || res.type;
    if (finalType && !isArrayType(finalType))
        checkOverflow(res.value, finalType);
    scope.values[name] = { value: res.value, type: finalType, mutable: mutable };
    localDecls.add(name);
    return res;
}
function validateArrayAccess(arrayName, scope, checkMutable) {
    if (checkMutable === void 0) { checkMutable = false; }
    var arrayVar = getFromScope(scope, arrayName);
    if (!arrayVar) {
        throw new Error("Variable not found: ".concat(arrayName));
    }
    if (checkMutable && !arrayVar.mutable) {
        throw new Error("Cannot assign to immutable array: ".concat(arrayName));
    }
    var val = arrayVar.value;
    if (typeof val !== "object" ||
        !Object.prototype.hasOwnProperty.call(val, "elements")) {
        throw new Error("".concat(arrayName, " is not an array"));
    }
    return { arrayVar: arrayVar, val: val };
}
function validateArrayIndex(indexStr, arrayLength, scope) {
    var indexVal = interpretRaw(indexStr, scope);
    var index = indexVal.value;
    if (!Number.isInteger(index) || index < 0 || index >= arrayLength) {
        throw new Error("Array index out of bounds: ".concat(index));
    }
    return index;
}
function handleArrayElementAssign(arrayName, indexStr, valueExpr, scope) {
    var val = validateArrayAccess(arrayName, scope, true).val;
    var index = validateArrayIndex(indexStr, val.elements.length, scope);
    var newValue = interpretRaw(valueExpr, scope);
    val.elements[index] = newValue;
    return newValue;
}
function handleAssign(st, scope) {
    // Check for array element assignment (e.g., array[index] = value)
    var arrayAssignMatch = st.match(/^([a-zA-Z_]\w*)\s*\[([^\]]+)\]\s*=\s*(.+)$/);
    if (arrayAssignMatch) {
        var arrayName = arrayAssignMatch[1], indexStr = arrayAssignMatch[2], valueExpr = arrayAssignMatch[3];
        return handleArrayElementAssign(arrayName, indexStr, valueExpr, scope);
    }
    // Regular variable assignment
    var m = st.match(/^([a-zA-Z_]\w*)\s*([+\-*/%]?=)(?!=)\s*(.+)$/);
    if (!m)
        throw new Error("Invalid assignment");
    var name = m[1], op = m[2], expr = m[3];
    var existing = getFromScope(scope, name);
    if (!existing)
        throw new Error("Variable not declared: ".concat(name));
    if (!existing.mutable) {
        throw new Error("Cannot assign to immutable variable: ".concat(name));
    }
    var rhs = interpretRaw(expr, scope);
    var res;
    if (op === "=") {
        res = rhs;
        var targetType = existing.type
            ? resolveTypeAlias(existing.type, scope)
            : existing.type;
        if (targetType && res.type)
            checkNarrowing(targetType, res.type);
        if (targetType)
            checkOverflow(res.value, targetType);
    }
    else {
        res = applyOp(existing, rhs, op[0]);
        if (existing.type)
            checkOverflow(res.value, existing.type);
    }
    updateInScope(scope, name, {
        value: res.value,
        type: existing.type || res.type,
        mutable: existing.mutable,
    });
    return res;
}
function findClosingBrace(s, startPos) {
    var d = 0;
    for (var i = startPos; i < s.length; i++) {
        if (s[i] === "{")
            d++;
        else if (s[i] === "}") {
            if (--d === 0)
                return i;
        }
    }
    return -1;
}
function parseBranch(s, pos) {
    while (pos < s.length && /\s/.test(s[pos]))
        pos++;
    if (s[pos] === "{") {
        var end = findClosingBrace(s, pos);
        if (end === -1)
            throw new Error("Missing closing brace for branch");
        return { content: s.slice(pos + 1, end), end: end + 1 };
    }
    // No braces - look for end of statement
    var depth = 0;
    var stmtEnd = s.length; // Default to end of string
    for (var i = pos; i < s.length; i++) {
        if (s[i] === "{" || s[i] === "(")
            depth++;
        else if (s[i] === "}" || s[i] === ")") {
            depth--;
            // If we encounter a closing brace/paren at depth -1 and we haven't found a statement end yet,
            // this closing brace/paren belongs to an outer structure, so stop here
            if (depth < 0) {
                stmtEnd = i;
                break;
            }
        }
        else if (s[i] === ";" && depth === 0) {
            stmtEnd = i;
            break;
        }
    }
    // Check for else/while after the statement
    var checkPos = stmtEnd;
    while (checkPos < s.length && /[\s;]/.test(s[checkPos]))
        checkPos++;
    if (checkPos < s.length) {
        var nextPart = s.slice(checkPos);
        if (nextPart.startsWith("else") || nextPart.startsWith("while")) {
            return { content: s.slice(pos, stmtEnd).trim(), end: stmtEnd };
        }
    }
    var elseMatch = s.slice(pos).match(/\belse\b/);
    if (elseMatch) {
        var content = s.slice(pos, pos + elseMatch.index).trim();
        return { content: content, end: pos + elseMatch.index };
    }
    return { content: s.slice(pos, stmtEnd).trim(), end: stmtEnd };
}
function extractCondition(s, keyword) {
    var condStart = s.indexOf("(");
    if (condStart === -1)
        throw new Error("Missing condition in ".concat(keyword));
    var d = 0, condEnd = -1;
    for (var i = condStart; i < s.length; i++) {
        if (s[i] === "(")
            d++;
        else if (s[i] === ")") {
            if (--d === 0) {
                condEnd = i;
                break;
            }
        }
    }
    if (condEnd === -1)
        throw new Error("Missing closing paren for ".concat(keyword, " condition"));
    return { condStr: s.slice(condStart + 1, condEnd), condEnd: condEnd };
}
function handleIf(s, scope) {
    var _a = extractCondition(s, "if"), condStr = _a.condStr, condEnd = _a.condEnd;
    var condition = interpretRaw(condStr, scope);
    var thenRes = parseBranch(s, condEnd + 1);
    var finalPos = thenRes.end;
    var elsePart;
    var checkElse = finalPos;
    while (checkElse < s.length && /\s/.test(s[checkElse]))
        checkElse++;
    if (s.slice(checkElse).startsWith("else")) {
        var elseRes = parseBranch(s, checkElse + 4);
        elsePart = elseRes.content;
        finalPos = elseRes.end;
    }
    try {
        var res = condition.value
            ? interpretRaw(thenRes.content, {
                values: {},
                parent: scope,
                structs: {},
            })
            : elsePart !== undefined
                ? interpretRaw(elsePart, { values: {}, parent: scope, structs: {} })
                : { value: 0 };
        return { val: res, end: finalPos };
    }
    catch (e) {
        if (e instanceof YieldSignal) {
            throw e;
        }
        throw e;
    }
}
function handleWhile(s, scope) {
    var _a = extractCondition(s, "while"), condStr = _a.condStr, condEnd = _a.condEnd;
    var bodyRes = parseBranch(s, condEnd + 1);
    var bodyStr = bodyRes.content;
    var finalPos = bodyRes.end;
    var lastVal = { value: 0 };
    try {
        while (interpretRaw(condStr, scope).value) {
            lastVal = interpretRaw(bodyStr, {
                values: {},
                parent: scope,
                structs: {},
            });
        }
    }
    catch (e) {
        if (e instanceof YieldSignal) {
            throw e;
        }
        throw e;
    }
    return { val: lastVal, end: finalPos };
}
function handleDoWhile(s, scope) {
    var bodyRes = parseBranch(s, 2);
    var bodyStr = bodyRes.content;
    var pos = bodyRes.end;
    while (pos < s.length && (/\s/.test(s[pos]) || s[pos] === ";"))
        pos++;
    if (!s.slice(pos).startsWith("while")) {
        throw new Error("Missing while keyword for do-while loop at pos ".concat(pos, ". s: \"").concat(s.slice(0, 50), "...\""));
    }
    var _a = extractCondition(s.slice(pos), "while"), condStr = _a.condStr, condEnd = _a.condEnd;
    var finalPos = pos + condEnd + 1;
    var lastVal = { value: 0 };
    try {
        do {
            lastVal = interpretRaw(bodyStr, {
                values: {},
                parent: scope,
                structs: {},
            });
        } while (interpretRaw(condStr, scope).value);
    }
    catch (e) {
        if (e instanceof YieldSignal) {
            throw e;
        }
        throw e;
    }
    return { val: lastVal, end: finalPos };
}
function parseRange(rangeStr, scope) {
    // Parse range: number..number
    var rangeMatch = rangeStr.trim().match(/^(.+?)\.\.(.+)$/);
    if (!rangeMatch) {
        throw new Error("Invalid range syntax: ".concat(rangeStr));
    }
    var startExpr = rangeMatch[1].trim();
    var endExpr = rangeMatch[2].trim();
    var startVal = interpretRaw(startExpr, scope);
    var endVal = interpretRaw(endExpr, scope);
    var start = Math.floor(startVal.value);
    var end = Math.floor(endVal.value);
    return { start: start, end: end };
}
function handleFor(s, scope) {
    var _a;
    // Parse: for(let mut varName in range) body
    // Find the opening paren after 'for'
    if (!s.startsWith("for(")) {
        throw new Error("Invalid for loop: must start with 'for('");
    }
    // Find matching closing paren for the for( ... )
    var parenDepth = 0;
    var forParenEnd = -1;
    for (var i = 3; i < s.length; i++) {
        if (s[i] === "(")
            parenDepth++;
        else if (s[i] === ")") {
            parenDepth--;
            if (parenDepth === 0) {
                forParenEnd = i;
                break;
            }
        }
    }
    if (forParenEnd === -1) {
        throw new Error("Missing closing paren in for loop");
    }
    var forHeader = s.slice(4, forParenEnd); // Extract content between for( and )
    // Parse: let mut varName in range
    var headerMatch = forHeader.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s+in\s+(.+)$/);
    if (!headerMatch) {
        throw new Error("Invalid for loop header: for(".concat(forHeader, ")"));
    }
    var mutS = headerMatch[1], varName = headerMatch[2], rangeStr = headerMatch[3];
    var _b = parseRange(rangeStr, scope), start = _b.start, end = _b.end;
    var bodyRes = parseBranch(s, forParenEnd + 1);
    var bodyStr = bodyRes.content; // Keep original body string for all iterations
    var finalPos = bodyRes.end;
    var lastVal = { value: 0 };
    try {
        for (var i = start; i < end; i++) {
            // Create new scope for loop iteration with loop variable
            var loopScope = {
                values: (_a = {},
                    _a[varName] = {
                        value: i,
                        type: undefined,
                        mutable: !!mutS,
                    },
                    _a),
                parent: scope,
                structs: scope.structs,
                typeAliases: scope.typeAliases,
                functions: scope.functions,
            };
            // Use the original bodyStr each iteration, not the processed one
            lastVal = interpretRaw(bodyStr, loopScope);
        }
    }
    catch (e) {
        if (e instanceof YieldSignal) {
            throw e;
        }
        throw e;
    }
    return { val: lastVal, end: finalPos };
}
function handleMatch(s, scope) {
    var _a = extractCondition(s, "match"), condStr = _a.condStr, condEnd = _a.condEnd;
    var target = interpretRaw(condStr, scope);
    var bodyRes = parseBranch(s, condEnd + 1);
    var bodyStr = bodyRes.content;
    var finalPos = bodyRes.end;
    var cases = splitStatements(bodyStr);
    try {
        for (var _i = 0, cases_1 = cases; _i < cases_1.length; _i++) {
            var c = cases_1[_i];
            var m = c.match(/^case\s+(.+)\s*=>\s*(.+)$/);
            if (!m)
                continue;
            var patternStr = m[1], consequenceStr = m[2];
            var pattern = patternStr.trim();
            var isMatch = false;
            if (pattern === "_") {
                isMatch = true;
            }
            else {
                var pVal = interpretRaw(pattern, scope);
                if (pVal.value === target.value)
                    isMatch = true;
            }
            if (isMatch) {
                var res = interpretRaw(consequenceStr, scope);
                return { val: res, end: finalPos };
            }
        }
    }
    catch (e) {
        if (e instanceof YieldSignal) {
            throw e;
        }
        throw e;
    }
    return { val: { value: 0 }, end: finalPos };
}
function resolveExpressions(s, keyword, handler, scope) {
    var res = s;
    while (true) {
        var kwIdx = -1;
        var searchPos = res.length;
        while (searchPos >= 0) {
            var found = res.lastIndexOf(keyword, searchPos);
            if (found === -1)
                break;
            if ((found === 0 || !/[a-zA-Z0-9_]/.test(res[found - 1])) &&
                (found + keyword.length === res.length ||
                    !/[a-zA-Z0-9_]/.test(res[found + keyword.length]))) {
                kwIdx = found;
                break;
            }
            searchPos = found - 1;
        }
        if (kwIdx === -1)
            break;
        var val = void 0;
        var end = void 0;
        try {
            var result = handler(res.slice(kwIdx), scope);
            val = result.val;
            end = result.end;
        }
        catch (e) {
            if (e instanceof YieldSignal) {
                throw e;
            }
            throw e;
        }
        // Don't append type suffix for Bool (boolean values are just 0 or 1)
        var typeSuffix = val.type && val.type !== "Bool" ? val.type : "";
        res = res.slice(0, kwIdx) + val.value + typeSuffix + res.slice(kwIdx + end);
    }
    return res;
}
function splitStatements(s) {
    var result = [];
    var current = "";
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
        var char = s[i];
        if (char === "{" || char === "(" || char === "[")
            depth++;
        if (char === "}" || char === ")" || char === "]")
            depth--;
        if (char === ";" && depth === 0) {
            result.push(current.trim());
            current = "";
            continue;
        }
        current += char;
        if (char === "}" && depth === 0) {
            var j = i + 1;
            while (j < s.length && /\s/.test(s[j]))
                j++;
            if (j < s.length) {
                var nextPart = s.slice(j);
                if (!nextPart.startsWith("else") &&
                    !nextPart.startsWith("while") &&
                    !nextPart.startsWith(";") &&
                    !/^[+\-*/%|&^=<>.!]/.test(nextPart)) {
                    result.push(current.trim());
                    current = "";
                    i = j - 1;
                }
            }
        }
    }
    if (current.trim())
        result.push(current.trim());
    return result;
}
function shouldSkipBracketResolution(s) {
    // Skip bracket resolution for struct definitions, struct initialization, struct literals, function declarations, and arrow functions
    // Also skip array declarations and initializations
    var isStructLiteral = /[a-zA-Z_]\w*\s*\{[^}]+\}\s*\./.test(s);
    var isArrowFunction = /\([^)]*\)\s*:\s*[a-zA-Z_]\w+\s*=>/.test(s);
    // Match array types - any let statement with : [ in it
    var isArrayType = /^let\s+(mut\s+)?[a-zA-Z_]\w*\s*:\s*\[/.test(s);
    return !!(s.match(/^struct\s+[a-zA-Z_]\w*\s*\{[^}]+\}/) ||
        s.match(/^let\s+(mut\s+)?[a-zA-Z_]\w*\s*=\s*[a-zA-Z_]\w+\s*\{[^}]+\}/) ||
        s.match(/^fn\s+[a-zA-Z_]\w+\s*\([^)]*\)\s*:\s*[a-zA-Z_]\w+\s*=>/) ||
        isStructLiteral ||
        isArrowFunction ||
        isArrayType);
}
function resolveBracketsInString(s, scope) {
    var res = s.trim();
    while (res.includes("(") || res.includes("{")) {
        var lastOpenParen = res.lastIndexOf("(");
        var lastOpenCurly = res.lastIndexOf("{");
        var isCurly = lastOpenCurly > lastOpenParen;
        var lastOpen = isCurly ? lastOpenCurly : lastOpenParen;
        // Don't resolve if this is a function call (identifier immediately before the paren)
        if (!isCurly && lastOpen > 0) {
            var beforeParen = res[lastOpen - 1];
            if (/[a-zA-Z_0-9)]/.test(beforeParen)) {
                // This looks like a function call or index, don't resolve it
                break;
            }
        }
        var closeChar = isCurly ? "}" : ")";
        var nextClose = res.indexOf(closeChar, lastOpen);
        if (nextClose === -1) {
            throw new Error("Missing closing ".concat(isCurly ? "curly brace" : "parenthesis"));
        }
        var internal = res.slice(lastOpen + 1, nextClose);
        var result = interpretRaw(internal, isCurly ? { values: {}, parent: scope, structs: {} } : scope);
        var following = res.slice(nextClose + 1).trim();
        var needsSemicolon = isCurly && following.length > 0 && !/^[+\-*/%|&^=]/.test(following);
        // Don't append type suffix for Bool (boolean values are just 0 or 1)
        var typeSuffix = result.type && result.type !== "Bool" ? result.type : "";
        res =
            res.slice(0, lastOpen) +
                result.value +
                typeSuffix +
                (needsSemicolon ? ";" : "") +
                res.slice(nextClose + 1);
    }
    return res;
}
function resolveBrackets(s, scope) {
    if (shouldSkipBracketResolution(s)) {
        return s.trim();
    }
    return resolveBracketsInString(s, scope);
}
function parseTypeAlias(st, scope) {
    var cleaned = st.trim().replace(/;+$/, ""); // Remove trailing semicolons
    var m = cleaned.match(/^type\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (!m)
        throw new Error("Invalid type alias declaration: ".concat(st.trim()));
    var aliasName = m[1], typeDefStr = m[2];
    // Parse union types: Type1 | Type2 | Type3
    var componentTypes = typeDefStr
        .split("|")
        .map(function (t) { return t.trim(); })
        .filter(function (t) { return t.length > 0; });
    if (componentTypes.length === 0) {
        throw new Error("Invalid type alias declaration: ".concat(st.trim()));
    }
    // Validate that all components are valid type names (identifiers)
    for (var _i = 0, componentTypes_1 = componentTypes; _i < componentTypes_1.length; _i++) {
        var type = componentTypes_1[_i];
        if (!/^[a-zA-Z_]\w*$/.test(type)) {
            throw new Error("Invalid type name in union: ".concat(type));
        }
    }
    if (!scope.typeAliases)
        scope.typeAliases = {};
    // Store union as pipe-separated string
    scope.typeAliases[aliasName] = componentTypes.join("|");
}
function parseStructDef(st, scope) {
    var m = st.match(/^struct\s+([a-zA-Z_]\w+)\s*\{([^}]+)\}$/);
    if (!m)
        throw new Error("Invalid struct declaration: ".concat(st));
    var structName = m[1], fieldStr = m[2];
    var fields = {};
    var fieldDecls = fieldStr.split(",").map(function (s) { return s.trim(); });
    for (var _i = 0, fieldDecls_2 = fieldDecls; _i < fieldDecls_2.length; _i++) {
        var decl = fieldDecls_2[_i];
        var _a = decl.split(":").map(function (s) { return s.trim(); }), fname = _a[0], ftype = _a[1];
        if (fname && ftype)
            fields[fname] = ftype;
    }
    if (!scope.structs)
        scope.structs = {};
    scope.structs[structName] = { fields: fields };
}
function parseFunctionDef(st, scope) {
    // Match: fn name(param1 : type1, ...) [: returnType] => body
    // Return type is optional now
    var m = st.match(/^fn\s+([a-zA-Z_]\w+)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_]\w+))?\s*=>\s*(.+)$/);
    if (!m)
        throw new Error("Invalid function declaration: ".concat(st));
    var funcName = m[1], paramStr = m[2], returnType = m[3], body = m[4];
    var params = [];
    if (paramStr.trim()) {
        var paramDecls = paramStr.split(",").map(function (s) { return s.trim(); });
        for (var _i = 0, paramDecls_1 = paramDecls; _i < paramDecls_1.length; _i++) {
            var decl = paramDecls_1[_i];
            var parts = decl.split(":").map(function (s) { return s.trim(); });
            if (parts.length !== 2)
                throw new Error("Invalid parameter: ".concat(decl));
            var pname = parts[0], ptype = parts[1];
            params.push({ name: pname, type: ptype });
        }
    }
    if (!scope.functions)
        scope.functions = {};
    scope.functions[funcName] = { params: params, returnType: returnType !== null && returnType !== void 0 ? returnType : null, body: body };
}
function resolveStructLiterals(st, scope) {
    // Match struct literal patterns: StructName { field : value, ... }
    var result = st;
    var changed = true;
    var iterations = 0;
    while (changed && iterations < 100) {
        iterations++;
        changed = false;
        var structLiteralRegex = /([a-zA-Z_]\w+)\s*\{([^}]+)\}/;
        var m = structLiteralRegex.exec(result);
        if (!m)
            break;
        var fullMatch = m[0], structName = m[1], fieldStr = m[2];
        var struct = getStructFromScope(scope, structName);
        // Only process if it's a known struct
        if (struct) {
            var fields = parseStructFields(fieldStr, scope);
            // Replace struct literal with a temporary variable reference
            var tempName = "__struct_lit_".concat(Math.random().toString(36).slice(2));
            scope.values[tempName] = {
                value: fields,
                type: structName,
                mutable: false,
            };
            result =
                result.slice(0, m.index) +
                    tempName +
                    result.slice(m.index + fullMatch.length);
            changed = true;
        }
        else {
            break;
        }
    }
    return result;
}
function evaluateStructLiteralExpression(st, scope) {
    // Check if this is a struct literal with member access like: Point { x : 3 }.x
    var m = st.match(/^([a-zA-Z_]\w+)\s*\{([^}]+)\}(.*)$/);
    if (!m)
        return null;
    var structName = m[1], fieldStr = m[2], rest = m[3];
    var struct = getStructFromScope(scope, structName);
    if (!struct)
        return null; // Not a struct literal, continue with normal parsing
    // Parse the struct literal
    var fields = parseStructFields(fieldStr, scope);
    if (!rest || rest.trim().length === 0) {
        // Just a struct literal, no member access
        return { value: fields, type: structName };
    }
    // Handle member access (.x, .y, etc.)
    var accessMatch = rest.trim().match(/^\.([a-zA-Z_]\w*)(.*)/);
    if (accessMatch) {
        var member = accessMatch[1], remaining = accessMatch[2];
        var memberValue = fields[member];
        if (memberValue === undefined) {
            throw new Error("Field ".concat(member, " not found in struct ").concat(structName));
        }
        if (!remaining || remaining.trim().length === 0) {
            return { value: memberValue };
        }
        // Handle chained access or operations on the member
        // For now, treat the member value as a new expression to evaluate
        return interpretRaw("".concat(memberValue).concat(remaining), scope);
    }
    return { value: fields, type: structName };
}
function getFunctionByNameOrVariable(funcName, scope) {
    // Check if it's a named function
    var func = getFunctionFromScope(scope, funcName);
    if (func)
        return func;
    // Check if it's a variable holding a function
    var funcVar = getFromScope(scope, funcName);
    if (funcVar &&
        funcVar.type &&
        (funcVar.type.includes("=>") ||
            funcVar.type.includes("I32") ||
            funcVar.type.includes("Bool"))) {
        // funcVar.value should be a function name
        var actualFuncName = funcVar.value;
        func = getFunctionFromScope(scope, actualFuncName);
        if (func)
            return func;
    }
    return null;
}
function resolveFunctionCallsInExpression(expr, scope) {
    var result = expr;
    var changed = true;
    while (changed) {
        changed = false;
        // Match function calls: identifier(args) - greedy match for nested parentheses
        var funcCallMatch = result.match(/([a-zA-Z_]\w*)\s*\(([^()]*(?:\([^()]*\))*[^()]*)\)/);
        if (funcCallMatch) {
            var fullMatch = funcCallMatch[0], funcName = funcCallMatch[1], argsStr = funcCallMatch[2];
            var func = getFunctionByNameOrVariable(funcName, scope);
            if (func) {
                var callResult = handleFunctionCall(funcName, func, argsStr, scope);
                result = result.replace(fullMatch, String(callResult.value));
                changed = true;
                continue;
            }
            break;
        }
    }
    return result;
}
function tryHandleDirectFunctionCall(st, scope) {
    var funcCallMatch = st.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*$/);
    if (!funcCallMatch)
        return null;
    var funcName = funcCallMatch[1], argsStr = funcCallMatch[2];
    var func = getFunctionByNameOrVariable(funcName, scope);
    if (func) {
        return handleFunctionCall(funcName, func, argsStr, scope);
    }
    return null;
}
function tryHandleArrayAccess(st, scope) {
    // Match array[index] pattern
    var arrayAccessMatch = st.match(/^([a-zA-Z_]\w*)\s*\[([^\]]+)\]\s*$/);
    if (!arrayAccessMatch)
        return null;
    var arrayName = arrayAccessMatch[1], indexExpr = arrayAccessMatch[2];
    var val = validateArrayAccess(arrayName, scope, false).val;
    var index = validateArrayIndex(indexExpr, val.elements.length, scope);
    return val.elements[index];
}
function tryHandleTypeCheckingOperator(st, scope) {
    var isOpMatch = st.match(/^(.+?)\s+is\s+([a-zA-Z_]\w+)\s*$/);
    if (!isOpMatch)
        return null;
    var exprPart = isOpMatch[1], typePart = isOpMatch[2];
    var exprResult = interpretRaw(exprPart, scope);
    var resolvedType = resolveTypeAlias(typePart, scope);
    var matches = valueMatchesType(exprResult.value, exprResult.type, resolvedType, scope);
    return { value: matches ? 1 : 0, type: "Bool" };
}
function resolveArrayAccesses(expr, scope) {
    var result = expr;
    var changed = true;
    while (changed) {
        changed = false;
        // Match array accesses: identifier[index]
        var arrayAccessMatch = result.match(/([a-zA-Z_]\w*)\s*\[([^\]]+)\]/);
        if (arrayAccessMatch) {
            var fullMatch = arrayAccessMatch[0];
            var arrayAccess = tryHandleArrayAccess(fullMatch, scope);
            if (arrayAccess !== null) {
                result = result.replace(fullMatch, String(arrayAccess.value));
                changed = true;
                continue;
            }
            break;
        }
    }
    return result;
}
function evaluateExpressionStatement(st, scope) {
    // Try to handle function calls (name(...))
    var result = tryHandleDirectFunctionCall(st, scope);
    if (result !== null)
        return result;
    // Try to handle array access (name[index])
    result = tryHandleArrayAccess(st, scope);
    if (result !== null)
        return result;
    // Try to handle struct literal expressions directly
    result = evaluateStructLiteralExpression(st, scope);
    if (result !== null)
        return result;
    // Try to handle 'is' type checking operator
    result = tryHandleTypeCheckingOperator(st, scope);
    if (result !== null)
        return result;
    var resolvedSt = resolveStructLiterals(st, scope);
    // Resolve any function calls in the expression
    var expr = resolveFunctionCallsInExpression(resolvedSt, scope);
    // Resolve any array accesses in the expression
    expr = resolveArrayAccesses(expr, scope);
    var tokenRegex = /!*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64)|bool)?|!*[a-zA-Z_]\w*(?:\.\w+)*/g;
    var tokens = [];
    var m;
    while ((m = tokenRegex.exec(expr))) {
        tokens.push({ text: m[0], index: m.index });
    }
    if (tokens.length === 0)
        throw new Error("Invalid statement");
    return tokens.length === 1
        ? parseToken(tokens[0].text, scope)
        : evaluateExpression(expr, tokens, scope);
}
function processDefinitions(st, scope) {
    if (st.startsWith("type ")) {
        parseTypeAlias(st, scope);
        return { value: 0 };
    }
    if (st.startsWith("struct ")) {
        parseStructDef(st, scope);
        return { value: 0 };
    }
    if (st.startsWith("fn ")) {
        parseFunctionDef(st, scope);
        return { value: 0 };
    }
    return null;
}
function processStatement(st, scope, localDecls) {
    var lastVal = { value: 0 };
    if (st.startsWith("let ")) {
        lastVal = handleLet(st, scope, localDecls);
    }
    else if (st.includes("=") &&
        (st.match(/^[a-zA-Z_]\w*\s*([+\-*/%]?=)(?!=)/) ||
            st.match(/^[a-zA-Z_]\w*\s*\[[^\]]+\]\s*=(?!=)/))) {
        lastVal = handleAssign(st, scope);
    }
    else {
        lastVal = evaluateExpressionStatement(st, scope);
    }
    return lastVal;
}
function processSingleStatement(rawSt, scope, localDecls) {
    if (rawSt.startsWith("yield ")) {
        var expr = rawSt.slice(6).trim();
        if (expr.endsWith(";")) {
            expr = expr.slice(0, -1).trim();
        }
        var yieldValue = interpretRaw(expr, scope);
        throw new YieldSignal(yieldValue);
    }
    if (rawSt.startsWith("return ")) {
        var expr = rawSt.slice(7).trim();
        if (expr.endsWith(";")) {
            expr = expr.slice(0, -1).trim();
        }
        var returnValue = interpretRaw(expr, scope);
        throw new ReturnSignal(returnValue);
    }
    var st;
    try {
        st = resolveExpressions(rawSt, "do", handleDoWhile, scope);
        st = resolveExpressions(st, "for", handleFor, scope);
        st = resolveExpressions(st, "while", handleWhile, scope);
        st = resolveExpressions(st, "if", handleIf, scope);
        st = resolveExpressions(st, "match", handleMatch, scope);
        st = resolveBrackets(st, scope);
    }
    catch (e) {
        if (e instanceof ReturnSignal) {
            throw e;
        }
        throw e;
    }
    var defResult = processDefinitions(st, scope);
    if (defResult !== null) {
        return defResult;
    }
    if (!st)
        return { value: 0 };
    if (st.includes(";") && splitStatements(st).length > 1) {
        return evaluateStatements(st, scope);
    }
    return processStatement(st, scope, localDecls);
}
function evaluateStatements(s, scope) {
    var statements = splitStatements(s);
    var lastVal = { value: 0 };
    var localDecls = new Set();
    try {
        for (var _i = 0, statements_1 = statements; _i < statements_1.length; _i++) {
            var rawSt = statements_1[_i];
            lastVal = processSingleStatement(rawSt, scope, localDecls);
        }
    }
    catch (e) {
        if (e instanceof YieldSignal) {
            return e.value;
        }
        // ReturnSignal should propagate up to function call handler
        throw e;
    }
    return lastVal;
}
function interpretRaw(input, scope) {
    return evaluateStatements(input, scope);
}
function interpret(input, scope) {
    if (scope === void 0) { scope = {}; }
    return interpretRaw(input, {
        values: scope,
        structs: {},
        typeAliases: {},
        functions: {},
    }).value;
}
