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

function interpretWithScope(input: string, scope: Map<string, number> = new Map(), typeMap: Map<string, number> = new Map(), mutMap: Map<string, boolean> = new Map()): number {
    const s = input.trim();
    if (s === "") return 0;

    if (s.indexOf("let ") === 0) {
        const semiIndex = s.indexOf(";");
        if (semiIndex !== -1) {
            const isMut = s.indexOf("mut ") !== -1;
            const declStr = s.slice(0, semiIndex);
            const eqIndex = declStr.indexOf("=");
            if (eqIndex !== -1) {
                const varPart = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim();
                const colonIndex = varPart.indexOf(":");
                const varName = colonIndex !== -1 ? varPart.slice(0, colonIndex).trim() : varPart;
                if (scope.has(varName)) throw new Error(`variable '${varName}' already declared in this scope`);
                const exprStr = declStr.slice(eqIndex + 1).trim();
                const varValue = interpretWithScope(exprStr, scope, typeMap, mutMap);
                const valueInfo = extractTypedInfo(exprStr);
                const vType = valueInfo.typeSize || (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
                if (colonIndex !== -1) {
                    const dType = extractTypeSize(varPart.slice(colonIndex + 1).trim());
                    if (dType > 0 && vType > 0 && vType > dType) throw new Error(`cannot assign type of size ${vType} to U${dType}`);
                }
                scope.set(varName, varValue);
                if (vType > 0) typeMap.set(varName, vType);
                if (isMut) mutMap.set(varName, true);
                return interpretWithScope(s.slice(semiIndex + 1).trim(), scope, typeMap, mutMap);
            }
        }
    }

    const eqIdx = s.indexOf("=");
    if (eqIdx > 0 && s[eqIdx + 1] !== "=" && scope.has(s.slice(0, eqIdx).trim())) {
        const lhs = s.slice(0, eqIdx).trim();
        if (!mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
        const semiIdx = s.indexOf(";", eqIdx);
        if (semiIdx !== -1) {
            const rhs = s.slice(eqIdx + 1, semiIdx).trim();
            scope.set(lhs, interpretWithScope(rhs, scope, typeMap, mutMap));
            return interpretWithScope(s.slice(semiIdx + 1).trim(), scope, typeMap, mutMap);
        }
    }

    if (scope.has(s.trim())) return scope.get(s.trim())!;
    if (!s.includes("+") && !s.includes("-") && !s.includes("*") && !s.includes("/") && !s.includes("(") && !s.includes("{") && !s.includes("[")) {
        return parseTypedNumber(s);
    }
    if (s.includes("(") || s.includes("{") || s.includes("[")) {
        const processed = evaluateGroupedExpressionsWithScope(s, scope, typeMap, mutMap);
        if (processed !== s) return interpretWithScope(processed, scope, typeMap, mutMap);
    }
    const { index: opIndex, operator: op } = findOperatorIndex(s);
    if (opIndex === -1) return parseTypedNumber(s);
    const left = interpretWithScope(s.slice(0, opIndex).trim(), scope, typeMap, mutMap);
    const right = interpretWithScope(s.slice(opIndex + 1).trim(), scope, typeMap, mutMap);
    return performBinaryOp(left, op, right, extractTypedInfo(s.slice(0, opIndex).trim()), s.slice(opIndex + 1).trim());
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

function evaluateGroupedExpressionsWithScope(s: string, scope: Map<string, number>, typeMap: Map<string, number>, mutMap: Map<string, boolean>): string {
    const pairs: Array<[string, string]> = [["(", ")"], ["{", "}"], ["[", "]"]];

    for (const [openChar, closeChar] of pairs) {
        const openIndex = s.indexOf(openChar);
        if (openIndex === -1) continue;

        const closeIndex = findMatchingClose(s, openIndex, openChar, closeChar);
        if (closeIndex === -1) throw new Error(`unmatched opening ${openChar}`);

        const inside = s.slice(openIndex + 1, closeIndex);
        const result = interpretWithScope(inside, scope, typeMap, mutMap);
        const replaced = s.slice(0, openIndex) + String(result) + s.slice(closeIndex + 1);
        return evaluateGroupedExpressionsWithScope(replaced, scope, typeMap, mutMap);
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
    return interpretWithScope(input, new Map(), new Map(), new Map());
}