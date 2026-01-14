const RANGES = {
    U8: { min: 0n, max: 255n },
    U16: { min: 0n, max: 65535n },
    U32: { min: 0n, max: 4294967295n },
    U64: { min: 0n, max: 18446744073709551615n },
    I8: { min: -128n, max: 127n },
    I16: { min: -32768n, max: 32767n },
    I32: { min: -2147483648n, max: 2147483647n },
    I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};
class YieldSignal {
    constructor(value) {
        this.value = value;
    }
}
class ReturnSignal {
    constructor(value) {
        this.value = value;
    }
}
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
    const resolved = getTypeAliasFromScope(scope, type);
    if (resolved) {
        // For union types, recursively resolve each component
        if (resolved.includes("|")) {
            const components = resolved.split("|").map((t) => {
                const trimmed = t.trim();
                return resolveTypeAlias(trimmed, scope);
            });
            return components.join("|");
        }
        return resolveTypeAlias(resolved, scope);
    }
    return type;
}
function checkValueAgainstUnion(value, valueType, components) {
    for (const component of components) {
        if (valueType && valueType === component)
            return true;
        // For untyped values, check if it fits in component's range
        if (!valueType) {
            const range = RANGES[component];
            if (range) {
                const bigVal = BigInt(Math.floor(value));
                if (bigVal >= range.min && bigVal <= range.max)
                    return true;
            }
        }
    }
    return false;
}
function valueMatchesType(value, valueType, targetType, scope) {
    // Resolve the valueType if it's an alias
    const resolvedValueType = valueType
        ? resolveTypeAlias(valueType, scope)
        : undefined;
    const resolvedTargetType = resolveTypeAlias(targetType, scope);
    // If valueType is a union and targetType is not, check if targetType is one of the union members
    if (resolvedValueType &&
        resolvedValueType.includes("|") &&
        !resolvedTargetType.includes("|")) {
        const components = resolvedValueType.split("|").map((t) => t.trim());
        return components.includes(resolvedTargetType);
    }
    // If targetType is a union, check against all components
    if (resolvedTargetType.includes("|")) {
        const components = resolvedTargetType.split("|").map((t) => t.trim());
        // If valueType is also a union, check if they're equivalent
        if (resolvedValueType && resolvedValueType.includes("|")) {
            const valueComponents = resolvedValueType.split("|").map((t) => t.trim());
            // Check if all components match
            if (valueComponents.length === components.length) {
                let allMatch = true;
                for (const vc of valueComponents) {
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
        const range = RANGES[resolvedTargetType];
        if (range) {
            const bigVal = BigInt(Math.floor(value));
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
    const sufMatch = rest.match(/^([uUiI])(8|16|32|64)(.*)$/);
    if (!sufMatch)
        return { value: n };
    const sign = sufMatch[1].toUpperCase();
    const bits = parseInt(sufMatch[2], 10);
    if (!/^[-+]?\d+$/.test(numStr)) {
        throw new Error("Integer required for integer type suffix");
    }
    const intVal = Number(numStr);
    const key = `${sign}${bits}`;
    const range = RANGES[key];
    if (!range)
        return { value: n };
    const big = BigInt(intVal);
    if (big < range.min || big > range.max)
        throw new Error(`${key} out of range`);
    if (bits === 64 &&
        (big > BigInt(Number.MAX_SAFE_INTEGER) ||
            big < BigInt(Number.MIN_SAFE_INTEGER))) {
        throw new Error(`${key} value not representable as a JavaScript number`);
    }
    return { value: Number(intVal), type: key };
}
function parseToken(token, scope) {
    if (token.startsWith("!")) {
        const res = parseToken(token.slice(1), scope);
        return { value: res.value ? 0 : 1, type: "Bool" };
    }
    if (token === "true")
        return { value: 1, type: "Bool" };
    if (token === "false")
        return { value: 0, type: "Bool" };
    if (token.includes(".") && !/^[+-]?\d+\.\d+/.test(token)) {
        const parts = token.split(".");
        const obj = getFromScope(scope, parts[0]);
        if (!obj)
            throw new Error(`Variable ${parts[0]} not found`);
        if (typeof obj.value === "object" && obj.value !== null) {
            let current = obj.value;
            for (let i = 1; i < parts.length; i++) {
                if (typeof current !== "object" || current === null) {
                    throw new Error(`Cannot access property ${parts[i]} of non-object`);
                }
                current = current[parts[i]];
            }
            return { value: current };
        }
    }
    const inScope = getFromScope(scope, token);
    if (inScope)
        return inScope;
    const m = token.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!m)
        throw new Error(`Invalid token: ${token}`);
    const numStr = m[0];
    const n = parseFloat(numStr);
    if (Number.isNaN(n))
        throw new Error("Invalid number");
    const rest = token.slice(numStr.length);
    return parseTypeSuffix(numStr, rest, n);
}
function promoteTypes(type1, type2) {
    if (!type1 || type1 === "Bool")
        return type2;
    if (!type2 || type2 === "Bool")
        return type1;
    const r1 = RANGES[type1];
    const r2 = RANGES[type2];
    if (!r1)
        return type2;
    if (!r2)
        return type1;
    return r1.max >= r2.max ? type1 : type2;
}
function checkOverflow(value, type) {
    if (type && type !== "Bool") {
        const r = RANGES[type];
        if (!r)
            return;
        const big = BigInt(Math.floor(value));
        if (big < r.min || big > r.max)
            throw new Error(`${type} overflow`);
    }
}
function applyOp(left, right, op) {
    const opMap = {
        "*": (a, b) => a * b,
        "/": (a, b) => a / b,
        "%": (a, b) => a % b,
        "+": (a, b) => a + b,
        "-": (a, b) => a - b,
        "<": (a, b) => (a < b ? 1 : 0),
        ">": (a, b) => (a > b ? 1 : 0),
        "<=": (a, b) => (a <= b ? 1 : 0),
        ">=": (a, b) => (a >= b ? 1 : 0),
        "==": (a, b) => (a === b ? 1 : 0),
        "!=": (a, b) => (a !== b ? 1 : 0),
        "&&": (a, b) => (a && b ? 1 : 0),
        "||": (a, b) => (a || b ? 1 : 0),
    };
    if (!opMap[op])
        throw new Error(`Unknown operator: ${op}`);
    let type = promoteTypes(left.type, right.type);
    const res = opMap[op](left.value, right.value);
    if (["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(op)) {
        type = "Bool";
    }
    if (type !== "Bool")
        checkOverflow(res, type);
    return { value: res, type };
}
function evaluateExpression(s, tokens, scope) {
    const parsed = tokens.map((t) => ({
        ...parseToken(t.text, scope),
        text: t.text,
        index: t.index,
    }));
    const ops = [];
    for (let i = 1; i < parsed.length; i++) {
        const between = s.slice(parsed[i - 1].index + parsed[i - 1].text.length, parsed[i].index);
        const opMatch = between.match(/==|!=|<=|>=|&&|\|\||[+\-*/%<>]/);
        if (!opMatch)
            throw new Error(`Invalid operator between operands. Expression: "${s}", between: "${between}", tokens: ${tokens.map(t => `"${t.text}"`).join(", ")}`);
        ops.push(opMatch[0]);
    }
    const values = parsed.map((p) => ({
        value: p.value,
        type: p.type,
    }));
    const currentOps = [...ops];
    const processPass = (targetOps) => {
        for (let i = 0; i < currentOps.length; i++) {
            if (targetOps.includes(currentOps[i])) {
                const res = applyOp(values[i], values[i + 1], currentOps[i]);
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
    const noRanges = !targetRange || !sourceRange;
    const typeMismatch = noRanges ? target !== source : false;
    const outOfRange = targetRange && sourceRange
        ? targetRange.max < sourceRange.max || targetRange.min > sourceRange.min
        : false;
    if (typeMismatch || outOfRange) {
        throw new Error(`Incompatible types: cannot implicitly convert ${sourceType} to ${target}`);
    }
}
function checkTypeCompatibility(target, source, sourceType) {
    const targetRange = RANGES[target];
    const sourceRange = RANGES[source];
    validateTypeRange(targetRange, sourceRange, target, source, sourceType);
}
function checkNarrowing(targetType, sourceType) {
    // If target is a union type, check if source type is one of the union members
    if (targetType.includes("|")) {
        const components = targetType.split("|").map((t) => t.trim());
        // For union types, require exact type match (no implicit conversion)
        for (const component of components) {
            if (component === sourceType) {
                return; // Found an exact match
            }
        }
        throw new Error(`Incompatible types: ${sourceType} is not compatible with union ${targetType}`);
    }
    // If source is a union type (but target is not), check if all union members are compatible
    if (sourceType.includes("|")) {
        const components = sourceType.split("|").map((t) => t.trim());
        // All union members must be compatible with the target type
        for (const component of components) {
            checkTypeCompatibility(targetType, component, sourceType);
        }
        return; // All union members are compatible
    }
    // Single type narrowing check
    const target = RANGES[targetType];
    const source = RANGES[sourceType];
    validateTypeRange(target, source, targetType, sourceType, sourceType);
    // Check for narrowing specifically
    if (target &&
        source &&
        (target.max < source.max || target.min > source.min)) {
        throw new Error(`Incompatible types: cannot implicitly narrow ${sourceType} to ${targetType}`);
    }
}
function parseStructFields(fieldStr, scope
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields = {};
    const fieldDecls = fieldStr.split(",").map((s) => s.trim());
    for (const decl of fieldDecls) {
        const parts = decl.split(":").map((s) => s.trim());
        if (parts.length !== 2)
            throw new Error(`Invalid field declaration: ${decl}`);
        const [fname, fvalStr] = parts;
        const fval = interpretRaw(fvalStr, scope);
        fields[fname] = fval.value;
    }
    return fields;
}
function initializeStruct(name, structName, fieldStr, scope, mutable, localDecls) {
    const struct = getStructFromScope(scope, structName);
    if (!struct)
        throw new Error(`Struct ${structName} not defined`);
    const fields = parseStructFields(fieldStr, scope);
    scope.values[name] = {
        value: fields,
        type: structName,
        mutable,
    };
    localDecls.add(name);
    return { value: fields };
}
function bindFunctionParameters(func, args, funcScope) {
    for (let i = 0; i < func.params.length; i++) {
        const param = func.params[i];
        const arg = args[i];
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
    // Parse arguments
    const args = [];
    if (argsStr.trim()) {
        const argExprs = argsStr.split(",").map((a) => a.trim());
        for (const argExpr of argExprs) {
            args.push(interpretRaw(argExpr, scope));
        }
    }
    // Validate argument count
    if (args.length !== func.params.length) {
        throw new Error(`Function ${funcName} expects ${func.params.length} arguments, got ${args.length}`);
    }
    // Create function scope with parameters
    const funcScope = {
        values: {},
        parent: scope,
    };
    bindFunctionParameters(func, args, funcScope);
    // Execute function body
    let result;
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
    return { value: result.value, type: func.returnType ?? result.type };
}
function extractTypeAndExpr(st) {
    // Find the = sign that separates type/name from expression
    let eqPos = -1;
    let depth = 0;
    for (let i = st.length - 1; i >= 0; i--) {
        const char = st[i];
        // When going backward, we encounter closing brackets/braces/parens first
        if (char === ")" || char === "}" || char === "]")
            depth++;
        if (char === "(" || char === "{" || char === "[")
            depth--;
        // Look for = at depth 0, but not part of =>, ==, !=, +=, etc.
        if (char === "=" && depth === 0) {
            const nextChar = i + 1 < st.length ? st[i + 1] : "";
            const prevChar = i > 0 ? st[i - 1] : "";
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
    let typeAndName = st;
    let expr = null;
    if (eqPos !== -1) {
        typeAndName = st.slice(0, eqPos).trim();
        expr = st.slice(eqPos + 1).trim();
    }
    // Parse "let [mut] name [: type]"
    const m = typeAndName.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*(.+))?$/);
    if (!m)
        return null;
    const [, mutS, name, type] = m;
    return { type: type || null, expr, name, mutable: !!mutS };
}
function parseParameters(paramsStr) {
    return paramsStr
        .split(",")
        .filter((p) => p.trim())
        .map((p) => {
        const pMatch = p.trim().match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
        if (!pMatch)
            throw new Error(`Invalid parameter: ${p}`);
        return { name: pMatch[1], type: pMatch[2].trim() };
    });
}
function isArrayType(type) {
    // Check if type matches [ElementType; InitCount; TotalCount]
    return type ? /^\[.+;\s*\d+;\s*\d+\]$/.test(type) : false;
}
function parseArrayType(type) {
    const match = type.match(/^\[(.+);\s*(\d+);\s*(\d+)\]$/);
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
        throw new Error(`Invalid array literal: ${expr}`);
    }
    const inner = expr.trim().slice(1, -1);
    if (!inner.trim())
        return [];
    const elements = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const char = inner[i];
        if (char === "(" || char === "[" || char === "{") {
            depth++;
        }
        else if (char === ")" || char === "]" || char === "}") {
            depth--;
        }
        else if (char === "," && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
                elements.push(interpretRaw(trimmed, scope));
            }
            current = "";
            continue;
        }
        current += char;
    }
    const trimmed = current.trim();
    if (trimmed) {
        elements.push(interpretRaw(trimmed, scope));
    }
    return elements;
}
function parseFunctionExpression(expr, scope, type) {
    // Parse the function definition - return type is optional
    const fnMatch = expr.match(/^fn\s+([a-zA-Z_]\w+)\s*\(([^)]*)\)(?:\s*:\s*([^=]+?))?\s*=>\s*(.+)$/);
    if (!fnMatch) {
        throw new Error(`Invalid function expression: "${expr}"`);
    }
    const [, fnName, paramsStr, returnType, body] = fnMatch;
    const params = parseParameters(paramsStr);
    const func = {
        params,
        returnType: returnType ? returnType.trim() : null,
        body,
    };
    // Store the function in scope
    if (!scope.functions)
        scope.functions = {};
    scope.functions[fnName] = func;
    // Create a function reference value - we'll store the function name as the value
    return { value: fnName, type: type ?? undefined };
}
function findMatchingCloseParen(expr, startIdx = 0) {
    let parenDepth = 0;
    for (let i = startIdx; i < expr.length; i++) {
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
    const closeParenIdx = findMatchingCloseParen(expr);
    if (closeParenIdx === -1)
        return false;
    // Check what comes after: should have =>
    const rest = expr.slice(closeParenIdx + 1).trim();
    return rest.includes("=>");
}
function extractArrowFunctionParts(expr) {
    const closeParenIdx = findMatchingCloseParen(expr);
    if (closeParenIdx === -1 || !expr.startsWith("(")) {
        throw new Error(`Invalid arrow function: "${expr}"`);
    }
    const paramsStr = expr.slice(1, closeParenIdx);
    const rest = expr.slice(closeParenIdx + 1).trim();
    const arrowMatch = rest.match(/^\s*:\s*([^=]+)\s*=>\s*(.+)$/);
    if (!arrowMatch) {
        throw new Error(`Invalid arrow function: "${expr}"`);
    }
    const [, returnType, body] = arrowMatch;
    return { paramsStr, returnType: returnType.trim(), body };
}
function parseArrowFunctionExpression(expr, scope, type, varName) {
    // Parse arrow function: (params) : returnType => body
    const { paramsStr, returnType, body } = extractArrowFunctionParts(expr);
    const params = parseParameters(paramsStr);
    const func = {
        params,
        returnType,
        body,
    };
    // Store the function in scope with variable name as key
    if (!scope.functions)
        scope.functions = {};
    scope.functions[varName] = func;
    // Create a function reference value - we'll store the function name as the value
    return { value: varName, type: type ?? undefined };
}
function initializeArray(type, expr, scope) {
    const arrayType = parseArrayType(type);
    if (!arrayType)
        throw new Error(`Invalid array type: ${type}`);
    const elements = parseArrayLiteral(expr, scope);
    if (elements.length > arrayType.initCount) {
        throw new Error(`Too many elements: expected ${arrayType.initCount}, got ${elements.length}`);
    }
    // Store array as object with elements and metadata
    return {
        value: {
            elements,
            elementType: arrayType.elementType,
            initCount: arrayType.initCount,
            totalCount: arrayType.totalCount,
        },
        type: `[${arrayType.elementType}; ${arrayType.initCount}; ${arrayType.totalCount}]`,
    };
}
function handleLet(st, scope, localDecls) {
    // Check for struct initialization first
    const structInit = st.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w+)\s*\{(.+)\}$/);
    if (structInit) {
        const [, mutS, name, structName, fieldStr] = structInit;
        return initializeStruct(name, structName, fieldStr, scope, !!mutS, localDecls);
    }
    // Parse using new function that handles complex types
    const parsed = extractTypeAndExpr(st);
    if (!parsed) {
        throw new Error("Invalid let declaration");
    }
    const { type, expr, name, mutable } = parsed;
    if (localDecls.has(name)) {
        throw new Error(`Variable already declared in this scope: ${name}`);
    }
    let res = { value: 0, type: type ?? undefined };
    if (expr) {
        // Special handling for arrays
        if (isArrayType(type)) {
            res = initializeArray(type, expr, scope);
        }
        else if (expr.startsWith("fn ")) {
            // Special handling for function expressions
            res = parseFunctionExpression(expr, scope, type);
        }
        else if (isArrowFunctionExpression(expr)) {
            // Arrow function syntax: (params) : returnType => body
            res = parseArrowFunctionExpression(expr, scope, type, name);
        }
        else {
            res = interpretRaw(expr, scope);
            const resolvedType = type ? resolveTypeAlias(type, scope) : type;
            if (resolvedType && res.type)
                checkNarrowing(resolvedType, res.type);
        }
    }
    const resolvedType = type ? resolveTypeAlias(type, scope) : type;
    const finalType = resolvedType || res.type;
    if (finalType && !isArrayType(finalType))
        checkOverflow(res.value, finalType);
    scope.values[name] = { value: res.value, type: finalType, mutable };
    localDecls.add(name);
    return res;
}
function handleAssign(st, scope) {
    const m = st.match(/^([a-zA-Z_]\w*)\s*([+\-*/%]?=)(?!=)\s*(.+)$/);
    if (!m)
        throw new Error("Invalid assignment");
    const [, name, op, expr] = m;
    const existing = getFromScope(scope, name);
    if (!existing)
        throw new Error(`Variable not declared: ${name}`);
    if (!existing.mutable) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    const rhs = interpretRaw(expr, scope);
    let res;
    if (op === "=") {
        res = rhs;
        const targetType = existing.type
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
    let d = 0;
    for (let i = startPos; i < s.length; i++) {
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
        const end = findClosingBrace(s, pos);
        if (end === -1)
            throw new Error("Missing closing brace for branch");
        return { content: s.slice(pos + 1, end), end: end + 1 };
    }
    // No braces - look for end of statement
    let depth = 0;
    let stmtEnd = pos;
    for (let i = pos; i < s.length; i++) {
        if (s[i] === "{" || s[i] === "(")
            depth++;
        else if (s[i] === "}" || s[i] === ")")
            depth--;
        else if (s[i] === ";" && depth === 0) {
            stmtEnd = i;
            break;
        }
    }
    // Check for else/while after the statement
    let checkPos = stmtEnd;
    while (checkPos < s.length && /[\s;]/.test(s[checkPos]))
        checkPos++;
    if (checkPos < s.length) {
        const nextPart = s.slice(checkPos);
        if (nextPart.startsWith("else") || nextPart.startsWith("while")) {
            return { content: s.slice(pos, stmtEnd).trim(), end: stmtEnd };
        }
    }
    const elseMatch = s.slice(pos).match(/\belse\b/);
    if (elseMatch) {
        const content = s.slice(pos, pos + elseMatch.index).trim();
        return { content, end: pos + elseMatch.index };
    }
    return { content: s.slice(pos).trim(), end: s.length };
}
function extractCondition(s, keyword) {
    const condStart = s.indexOf("(");
    if (condStart === -1)
        throw new Error(`Missing condition in ${keyword}`);
    let d = 0, condEnd = -1;
    for (let i = condStart; i < s.length; i++) {
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
        throw new Error(`Missing closing paren for ${keyword} condition`);
    return { condStr: s.slice(condStart + 1, condEnd), condEnd };
}
function handleIf(s, scope) {
    const { condStr, condEnd } = extractCondition(s, "if");
    const condition = interpretRaw(condStr, scope);
    const thenRes = parseBranch(s, condEnd + 1);
    let finalPos = thenRes.end;
    let elsePart;
    let checkElse = finalPos;
    while (checkElse < s.length && /\s/.test(s[checkElse]))
        checkElse++;
    if (s.slice(checkElse).startsWith("else")) {
        const elseRes = parseBranch(s, checkElse + 4);
        elsePart = elseRes.content;
        finalPos = elseRes.end;
    }
    try {
        const res = condition.value
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
    const { condStr, condEnd } = extractCondition(s, "while");
    const bodyRes = parseBranch(s, condEnd + 1);
    const bodyStr = bodyRes.content;
    const finalPos = bodyRes.end;
    let lastVal = { value: 0 };
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
    const bodyRes = parseBranch(s, 2);
    const bodyStr = bodyRes.content;
    let pos = bodyRes.end;
    while (pos < s.length && (/\s/.test(s[pos]) || s[pos] === ";"))
        pos++;
    if (!s.slice(pos).startsWith("while")) {
        throw new Error(`Missing while keyword for do-while loop at pos ${pos}. s: "${s.slice(0, 50)}..."`);
    }
    const { condStr, condEnd } = extractCondition(s.slice(pos), "while");
    const finalPos = pos + condEnd + 1;
    let lastVal = { value: 0 };
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
function handleMatch(s, scope) {
    const { condStr, condEnd } = extractCondition(s, "match");
    const target = interpretRaw(condStr, scope);
    const bodyRes = parseBranch(s, condEnd + 1);
    const bodyStr = bodyRes.content;
    const finalPos = bodyRes.end;
    const cases = splitStatements(bodyStr);
    try {
        for (const c of cases) {
            const m = c.match(/^case\s+(.+)\s*=>\s*(.+)$/);
            if (!m)
                continue;
            const [, patternStr, consequenceStr] = m;
            const pattern = patternStr.trim();
            let isMatch = false;
            if (pattern === "_") {
                isMatch = true;
            }
            else {
                const pVal = interpretRaw(pattern, scope);
                if (pVal.value === target.value)
                    isMatch = true;
            }
            if (isMatch) {
                const res = interpretRaw(consequenceStr, scope);
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
    let res = s;
    while (true) {
        let kwIdx = -1;
        let searchPos = res.length;
        while (searchPos >= 0) {
            const found = res.lastIndexOf(keyword, searchPos);
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
        let val;
        let end;
        try {
            const result = handler(res.slice(kwIdx), scope);
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
        const typeSuffix = val.type && val.type !== "Bool" ? val.type : "";
        res = res.slice(0, kwIdx) + val.value + typeSuffix + res.slice(kwIdx + end);
    }
    return res;
}
function splitStatements(s) {
    const result = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const char = s[i];
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
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j]))
                j++;
            if (j < s.length) {
                const nextPart = s.slice(j);
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
    const isStructLiteral = /[a-zA-Z_]\w*\s*\{[^}]+\}\s*\./.test(s);
    const isArrowFunction = /\([^)]*\)\s*:\s*[a-zA-Z_]\w+\s*=>/.test(s);
    // Match array types - any let statement with : [ in it
    const isArrayType = /^let\s+(mut\s+)?[a-zA-Z_]\w*\s*:\s*\[/.test(s);
    return !!(s.match(/^struct\s+[a-zA-Z_]\w*\s*\{[^}]+\}/) ||
        s.match(/^let\s+(mut\s+)?[a-zA-Z_]\w*\s*=\s*[a-zA-Z_]\w+\s*\{[^}]+\}/) ||
        s.match(/^fn\s+[a-zA-Z_]\w+\s*\([^)]*\)\s*:\s*[a-zA-Z_]\w+\s*=>/) ||
        isStructLiteral ||
        isArrowFunction ||
        isArrayType);
}
function resolveBracketsInString(s, scope) {
    let res = s.trim();
    while (res.includes("(") || res.includes("{")) {
        const lastOpenParen = res.lastIndexOf("(");
        const lastOpenCurly = res.lastIndexOf("{");
        const isCurly = lastOpenCurly > lastOpenParen;
        const lastOpen = isCurly ? lastOpenCurly : lastOpenParen;
        // Don't resolve if this is a function call (identifier immediately before the paren)
        if (!isCurly && lastOpen > 0) {
            const beforeParen = res[lastOpen - 1];
            if (/[a-zA-Z_0-9)]/.test(beforeParen)) {
                // This looks like a function call or index, don't resolve it
                break;
            }
        }
        const closeChar = isCurly ? "}" : ")";
        const nextClose = res.indexOf(closeChar, lastOpen);
        if (nextClose === -1) {
            throw new Error(`Missing closing ${isCurly ? "curly brace" : "parenthesis"}`);
        }
        const internal = res.slice(lastOpen + 1, nextClose);
        const result = interpretRaw(internal, isCurly ? { values: {}, parent: scope, structs: {} } : scope);
        const following = res.slice(nextClose + 1).trim();
        const needsSemicolon = isCurly && following.length > 0 && !/^[+\-*/%|&^=]/.test(following);
        // Don't append type suffix for Bool (boolean values are just 0 or 1)
        const typeSuffix = result.type && result.type !== "Bool" ? result.type : "";
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
    const cleaned = st.trim().replace(/;+$/, ""); // Remove trailing semicolons
    const m = cleaned.match(/^type\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (!m)
        throw new Error(`Invalid type alias declaration: ${st.trim()}`);
    const [, aliasName, typeDefStr] = m;
    // Parse union types: Type1 | Type2 | Type3
    const componentTypes = typeDefStr
        .split("|")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    if (componentTypes.length === 0) {
        throw new Error(`Invalid type alias declaration: ${st.trim()}`);
    }
    // Validate that all components are valid type names (identifiers)
    for (const type of componentTypes) {
        if (!/^[a-zA-Z_]\w*$/.test(type)) {
            throw new Error(`Invalid type name in union: ${type}`);
        }
    }
    if (!scope.typeAliases)
        scope.typeAliases = {};
    // Store union as pipe-separated string
    scope.typeAliases[aliasName] = componentTypes.join("|");
}
function parseStructDef(st, scope) {
    const m = st.match(/^struct\s+([a-zA-Z_]\w+)\s*\{([^}]+)\}$/);
    if (!m)
        throw new Error(`Invalid struct declaration: ${st}`);
    const [, structName, fieldStr] = m;
    const fields = {};
    const fieldDecls = fieldStr.split(",").map((s) => s.trim());
    for (const decl of fieldDecls) {
        const [fname, ftype] = decl.split(":").map((s) => s.trim());
        if (fname && ftype)
            fields[fname] = ftype;
    }
    if (!scope.structs)
        scope.structs = {};
    scope.structs[structName] = { fields };
}
function parseFunctionDef(st, scope) {
    // Match: fn name(param1 : type1, ...) [: returnType] => body
    // Return type is optional now
    const m = st.match(/^fn\s+([a-zA-Z_]\w+)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_]\w+))?\s*=>\s*(.+)$/);
    if (!m)
        throw new Error(`Invalid function declaration: ${st}`);
    const [, funcName, paramStr, returnType, body] = m;
    const params = [];
    if (paramStr.trim()) {
        const paramDecls = paramStr.split(",").map((s) => s.trim());
        for (const decl of paramDecls) {
            const parts = decl.split(":").map((s) => s.trim());
            if (parts.length !== 2)
                throw new Error(`Invalid parameter: ${decl}`);
            const [pname, ptype] = parts;
            params.push({ name: pname, type: ptype });
        }
    }
    if (!scope.functions)
        scope.functions = {};
    scope.functions[funcName] = { params, returnType: returnType ?? null, body };
}
function resolveStructLiterals(st, scope) {
    // Match struct literal patterns: StructName { field : value, ... }
    let result = st;
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
        iterations++;
        changed = false;
        const structLiteralRegex = /([a-zA-Z_]\w+)\s*\{([^}]+)\}/;
        const m = structLiteralRegex.exec(result);
        if (!m)
            break;
        const [fullMatch, structName, fieldStr] = m;
        const struct = getStructFromScope(scope, structName);
        // Only process if it's a known struct
        if (struct) {
            const fields = parseStructFields(fieldStr, scope);
            // Replace struct literal with a temporary variable reference
            const tempName = `__struct_lit_${Math.random().toString(36).slice(2)}`;
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
    const m = st.match(/^([a-zA-Z_]\w+)\s*\{([^}]+)\}(.*)$/);
    if (!m)
        return null;
    const [, structName, fieldStr, rest] = m;
    const struct = getStructFromScope(scope, structName);
    if (!struct)
        return null; // Not a struct literal, continue with normal parsing
    // Parse the struct literal
    const fields = parseStructFields(fieldStr, scope);
    if (!rest || rest.trim().length === 0) {
        // Just a struct literal, no member access
        return { value: fields, type: structName };
    }
    // Handle member access (.x, .y, etc.)
    const accessMatch = rest.trim().match(/^\.([a-zA-Z_]\w*)(.*)/);
    if (accessMatch) {
        const [, member, remaining] = accessMatch;
        const memberValue = fields[member];
        if (memberValue === undefined) {
            throw new Error(`Field ${member} not found in struct ${structName}`);
        }
        if (!remaining || remaining.trim().length === 0) {
            return { value: memberValue };
        }
        // Handle chained access or operations on the member
        // For now, treat the member value as a new expression to evaluate
        return interpretRaw(`${memberValue}${remaining}`, scope);
    }
    return { value: fields, type: structName };
}
function getFunctionByNameOrVariable(funcName, scope) {
    // Check if it's a named function
    let func = getFunctionFromScope(scope, funcName);
    if (func)
        return func;
    // Check if it's a variable holding a function
    const funcVar = getFromScope(scope, funcName);
    if (funcVar &&
        funcVar.type &&
        (funcVar.type.includes("=>") ||
            funcVar.type.includes("I32") ||
            funcVar.type.includes("Bool"))) {
        // funcVar.value should be a function name
        const actualFuncName = funcVar.value;
        func = getFunctionFromScope(scope, actualFuncName);
        if (func)
            return func;
    }
    return null;
}
function resolveFunctionCallsInExpression(expr, scope) {
    let result = expr;
    let changed = true;
    while (changed) {
        changed = false;
        // Match function calls: identifier(args) - greedy match for nested parentheses
        const funcCallMatch = result.match(/([a-zA-Z_]\w*)\s*\(([^()]*(?:\([^()]*\))*[^()]*)\)/);
        if (funcCallMatch) {
            const [fullMatch, funcName, argsStr] = funcCallMatch;
            const func = getFunctionByNameOrVariable(funcName, scope);
            if (func) {
                const callResult = handleFunctionCall(funcName, func, argsStr, scope);
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
    const funcCallMatch = st.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*$/);
    if (!funcCallMatch)
        return null;
    const [, funcName, argsStr] = funcCallMatch;
    const func = getFunctionByNameOrVariable(funcName, scope);
    if (func) {
        return handleFunctionCall(funcName, func, argsStr, scope);
    }
    return null;
}
function tryHandleArrayAccess(st, scope) {
    // Match array[index] pattern
    const arrayAccessMatch = st.match(/^([a-zA-Z_]\w*)\s*\[([^\]]+)\]\s*$/);
    if (!arrayAccessMatch)
        return null;
    const [, arrayName, indexExpr] = arrayAccessMatch;
    const arrayVar = getFromScope(scope, arrayName);
    // If we matched the pattern but the variable doesn't exist or isn't an array,
    // still try to handle it as array access (and error appropriately)
    if (!arrayVar) {
        throw new Error(`Variable not found: ${arrayName}`);
    }
    const val = arrayVar.value;
    if (typeof val !== "object" || !Object.prototype.hasOwnProperty.call(val, "elements")) {
        throw new Error(`${arrayName} is not an array`);
    }
    const indexVal = interpretRaw(indexExpr, scope);
    const index = indexVal.value;
    if (!Number.isInteger(index) || index < 0 || index >= val.elements.length) {
        throw new Error(`Array index out of bounds: ${index}`);
    }
    return val.elements[index];
}
function tryHandleTypeCheckingOperator(st, scope) {
    const isOpMatch = st.match(/^(.+?)\s+is\s+([a-zA-Z_]\w+)\s*$/);
    if (!isOpMatch)
        return null;
    const [, exprPart, typePart] = isOpMatch;
    const exprResult = interpretRaw(exprPart, scope);
    const resolvedType = resolveTypeAlias(typePart, scope);
    const matches = valueMatchesType(exprResult.value, exprResult.type, resolvedType, scope);
    return { value: matches ? 1 : 0, type: "Bool" };
}
function resolveArrayAccesses(expr, scope) {
    let result = expr;
    let changed = true;
    while (changed) {
        changed = false;
        // Match array accesses: identifier[index]
        const arrayAccessMatch = result.match(/([a-zA-Z_]\w*)\s*\[([^\]]+)\]/);
        if (arrayAccessMatch) {
            const [fullMatch] = arrayAccessMatch;
            const arrayAccess = tryHandleArrayAccess(fullMatch, scope);
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
    let result = tryHandleDirectFunctionCall(st, scope);
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
    const resolvedSt = resolveStructLiterals(st, scope);
    // Resolve any function calls in the expression
    let expr = resolveFunctionCallsInExpression(resolvedSt, scope);
    // Resolve any array accesses in the expression
    expr = resolveArrayAccesses(expr, scope);
    const tokenRegex = /!*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64)|bool)?|!*[a-zA-Z_]\w*(?:\.\w+)*/g;
    const tokens = [];
    let m;
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
    let lastVal = { value: 0 };
    if (st.startsWith("let ")) {
        lastVal = handleLet(st, scope, localDecls);
    }
    else if (st.includes("=") &&
        st.match(/^[a-zA-Z_]\w*\s*([+\-*/%]?=)(?!=)/)) {
        lastVal = handleAssign(st, scope);
    }
    else {
        lastVal = evaluateExpressionStatement(st, scope);
    }
    return lastVal;
}
function processSingleStatement(rawSt, scope, localDecls) {
    if (rawSt.startsWith("yield ")) {
        let expr = rawSt.slice(6).trim();
        if (expr.endsWith(";")) {
            expr = expr.slice(0, -1).trim();
        }
        const yieldValue = interpretRaw(expr, scope);
        throw new YieldSignal(yieldValue);
    }
    if (rawSt.startsWith("return ")) {
        let expr = rawSt.slice(7).trim();
        if (expr.endsWith(";")) {
            expr = expr.slice(0, -1).trim();
        }
        const returnValue = interpretRaw(expr, scope);
        throw new ReturnSignal(returnValue);
    }
    let st;
    try {
        st = resolveExpressions(rawSt, "do", handleDoWhile, scope);
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
    const defResult = processDefinitions(st, scope);
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
    const statements = splitStatements(s);
    let lastVal = { value: 0 };
    const localDecls = new Set();
    try {
        for (const rawSt of statements) {
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
export function interpret(input, scope = {}) {
    return interpretRaw(input, {
        values: scope,
        structs: {},
        typeAliases: {},
        functions: {},
    }).value;
}
