function scanNumericPrefix(s: string): number {
    const len = s.length;
    let i = 0;
    if (s[i] === "+" || s[i] === "-") i++;
    let hasDigits = false;
    while (i < len) {
        const ch = s[i];
        if (ch && ch >= "0" && ch <= "9") {
            hasDigits = true;
            i++;
        } else break;
    }
    if (i < len && s[i] === ".") {
        i++;
        while (i < len) {
            const ch = s[i];
            if (ch && ch >= "0" && ch <= "9") {
                hasDigits = true;
                i++;
            } else break;
        }
    }
    return hasDigits ? i : 0;
}

function extractUnsignedSize(suffix: string): number {
    if (suffix[0] !== "U" && suffix[0] !== "u") return 0;
    let j = 1;
    let sizeStr = "";
    while (j < suffix.length) {
        const ch = suffix[j];
        if (ch && ch >= "0" && ch <= "9") {
            sizeStr += ch;
            j++;
        } else break;
    }
    return sizeStr.length > 0 ? Number(sizeStr) : 0;
}

function validateUnsignedValue(n: number, size: number): void {
    const limits: Record<number, number> = { 8: 255, 16: 65535, 32: 4294967295, 64: Number.MAX_SAFE_INTEGER };
    const limit = limits[size];
    if (limit !== undefined && n > limit) throw new RangeError(`value ${n} out of range for U${size}`);
}

function extractTypedInfo(s: string): { value: number; typeSize: number } {
    const prefixEnd = scanNumericPrefix(s);
    if (prefixEnd === 0) {
        return { value: Number.isFinite(Number(s)) ? Number(s) : 0, typeSize: 0 };
    }
    const numStr = s.slice(0, prefixEnd);
    const n = Number(numStr);
    const typeSize = extractUnsignedSize(s.slice(prefixEnd));
    return { value: n, typeSize };
}

function findOperatorIndex(s: string): { index: number; operator: string } {
    for (let i = s.length - 1; i >= 1; i--) {
        const ch = s[i];
        if ((ch === "+" || ch === "-")) {
            const prev = s[i - 1];
            if (prev && ((prev >= "0" && prev <= "9") || prev === " " || prev === ")")) {
                return { index: i, operator: ch };
            }
        }
    }

    for (let i = s.length - 1; i >= 1; i--) {
        const ch = s[i];
        if ((ch === "*" || ch === "/")) {
            const prev = s[i - 1];
            if (prev && ((prev >= "0" && prev <= "9") || prev === " " || prev === ")")) {
                return { index: i, operator: ch };
            }
        }
    }

    return { index: -1, operator: "" };
}

function performBinaryOp(left: number, op: string, right: number, leftInfo: { value: number; typeSize: number }, rightStr: string): number {
    let result = 0;
    switch (op) {
        case "+": result = left + right; break;
        case "-": result = left - right; break;
        case "*": result = left * right; break;
        case "/": if (right === 0) throw new Error("division by zero"); result = Math.floor(left / right); break;
        default: return 0;
    }
    if (leftInfo.typeSize > 0 && !rightStr.includes("+") && !rightStr.includes("-") && !rightStr.includes("*") && !rightStr.includes("/")) {
        const rightInfo = extractTypedInfo(rightStr);
        if (rightInfo.typeSize === leftInfo.typeSize) validateUnsignedValue(result, leftInfo.typeSize);
    }
    return result;
}

function extractTypeSize(typeStr: string): number {
    const t = typeStr.trim();
    if (t[0] !== "U" && t[0] !== "I") return 0;
    let sizeStr = "";
    for (let j = 1; j < t.length; j++) {
        const ch = t[j];
        if (ch && ch >= "0" && ch <= "9") sizeStr += ch;
        else break;
    }
    return sizeStr.length > 0 ? Number(sizeStr) : 0;
}

function interpretWithScope(input: string, scope: Map<string, number> = new Map(), typeMap: Map<string, number> = new Map()): number {
    const s = input.trim();
    if (s === "") return 0;

    if (s.indexOf("let ") === 0) {
        const semiIndex = s.indexOf(";");
        if (semiIndex !== -1) {
            const declStr = s.slice(0, semiIndex);
            const eqIndex = declStr.indexOf("=");
            if (eqIndex !== -1) {
                const varPart = declStr.slice(4, eqIndex).trim();
                const colonIndex = varPart.indexOf(":");
                const varName = colonIndex !== -1 ? varPart.slice(0, colonIndex).trim() : varPart;
                const declaredType = colonIndex !== -1 ? varPart.slice(colonIndex + 1).trim() : "";
                if (scope.has(varName)) throw new Error(`variable '${varName}' already declared in this scope`);
                const exprStr = declStr.slice(eqIndex + 1).trim();
                const varValue = interpretWithScope(exprStr, scope, typeMap);
                const valueInfo = extractTypedInfo(exprStr);
                let valueType = valueInfo.typeSize;
                if (valueType === 0 && scope.has(exprStr)) valueType = typeMap.get(exprStr) || 0;
                if (declaredType) {
                    const declTypeSize = extractTypeSize(declaredType);
                    if (declTypeSize > 0 && valueType > 0 && valueType > declTypeSize) {
                        throw new Error(`cannot assign type of size ${valueType} to ${declaredType}`);
                    }
                }
                scope.set(varName, varValue);
                if (valueType > 0) typeMap.set(varName, valueType);
                return interpretWithScope(s.slice(semiIndex + 1).trim(), scope, typeMap);
            }
        }
    }

    if (scope.has(s.trim())) return scope.get(s.trim())!;
    if (!s.includes("+") && !s.includes("-") && !s.includes("*") && !s.includes("/") && !s.includes("(") && !s.includes("{") && !s.includes("[")) {
        return parseTypedNumber(s);
    }
    if (s.includes("(") || s.includes("{") || s.includes("[")) {
        const processed = evaluateGroupedExpressionsWithScope(s, scope, typeMap);
        if (processed !== s) return interpretWithScope(processed, scope, typeMap);
    }
    const { index: opIndex, operator: op } = findOperatorIndex(s);
    if (opIndex === -1) return parseTypedNumber(s);
    const leftStr = s.slice(0, opIndex).trim();
    const rightStr = s.slice(opIndex + 1).trim();
    const leftInfo = extractTypedInfo(leftStr);
    const left = interpretWithScope(leftStr, scope, typeMap);
    const right = interpretWithScope(rightStr, scope, typeMap);
    return performBinaryOp(left, op, right, leftInfo, rightStr);
}

function findMatchingClose(s: string, openIndex: number, openChar: string, closeChar: string): number {
    let depth = 0;
    for (let i = openIndex; i < s.length; i++) {
        const ch = s[i];
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function evaluateGroupedExpressionsWithScope(s: string, scope: Map<string, number>, typeMap: Map<string, number>): string {
    const pairs: Array<[string, string]> = [["(", ")"], ["{", "}"], ["[", "]"]];

    for (const [openChar, closeChar] of pairs) {
        const openIndex = s.indexOf(openChar);
        if (openIndex === -1) continue;

        const closeIndex = findMatchingClose(s, openIndex, openChar, closeChar);
        if (closeIndex === -1) throw new Error(`unmatched opening ${openChar}`);

        const inside = s.slice(openIndex + 1, closeIndex);
        const result = interpretWithScope(inside, scope, typeMap);
        const replaced = s.slice(0, openIndex) + String(result) + s.slice(closeIndex + 1);
        return evaluateGroupedExpressionsWithScope(replaced, scope, typeMap);
    }

    return s;
}

function parseTypedNumber(s: string): number {
    const prefixEnd = scanNumericPrefix(s);
    if (prefixEnd === 0) {
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    const numStr = s.slice(0, prefixEnd);
    const n = Number(numStr);
    const suffix = s.slice(prefixEnd);
    const typeSize = extractUnsignedSize(suffix);

    // Negative value with unsigned suffix is an error
    if (typeSize > 0 && n < 0) {
        throw new Error("negative value with unsigned suffix");
    }

    // Validate value against unsigned type bounds
    if (typeSize > 0) {
        validateUnsignedValue(n, typeSize);
    }

    return Number.isFinite(n) ? n : 0;
}

export function interpret(input: string): number {
    return interpretWithScope(input, new Map(), new Map());
}