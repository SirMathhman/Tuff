function scanNumericPrefix(s: string): number {
    // Returns the end index of the numeric prefix (including optional sign and fractional part)
    const len = s.length;
    let i = 0;

    // Optional sign
    if (s[i] === "+" || s[i] === "-") i++;

    let hasDigits = false;
    while (i < len) {
        const ch = s[i];
        if (ch === undefined) break;
        if (ch >= "0" && ch <= "9") {
            hasDigits = true;
            i++;
            continue;
        }
        break;
    }

    // Optional fractional part
    if (i < len && s[i] === ".") {
        i++;
        let fracDigits = false;
        while (i < len) {
            const ch = s[i];
            if (ch === undefined) break;
            if (ch >= "0" && ch <= "9") {
                fracDigits = true;
                i++;
                continue;
            }
            break;
        }
        hasDigits = hasDigits || fracDigits;
    }

    return hasDigits ? i : 0;
}

function extractUnsignedSize(suffix: string): number {
    // Parse digits after the 'U' or 'u' without regex
    const first = suffix[0];
    if (first !== "U" && first !== "u") return 0;

    let j = 1;
    let sizeStr = "";
    while (j < suffix.length) {
        const ch = suffix[j];
        if (ch === undefined) break;
        if (ch >= "0" && ch <= "9") {
            sizeStr += ch;
            j++;
            continue;
        }
        break;
    }

    return sizeStr.length > 0 ? Number(sizeStr) : 0;
}

function validateUnsignedValue(n: number, size: number): void {
    if (size === 8) {
        if (n > 255) throw new RangeError(`value ${n} out of range for U8`);
    } else if (size === 16) {
        if (n > 65535) throw new RangeError(`value ${n} out of range for U16`);
    } else if (size === 32) {
        if (n > 4294967295) throw new RangeError(`value ${n} out of range for U32`);
    } else if (size === 64) {
        if (n > Number.MAX_SAFE_INTEGER) throw new RangeError(`value ${n} out of range for U64`);
    }
}

function extractTypedInfo(s: string): { value: number; typeSize: number } {
    const prefixEnd = scanNumericPrefix(s);
    if (prefixEnd === 0) {
        return { value: Number.isFinite(Number(s)) ? Number(s) : 0, typeSize: 0 };
    }

    const numStr = s.slice(0, prefixEnd);
    const n = Number(numStr);
    const suffix = s.slice(prefixEnd);
    const typeSize = extractUnsignedSize(suffix);

    return { value: n, typeSize };
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
    const s = input.trim();
    if (s === "") return 0;

    // Check for binary operators (+, -, *, /)
    // We need to find the operator that is not part of a number's sign
    let opIndex = -1;
    let op = "";
    for (let i = 1; i < s.length; i++) {
        const ch = s[i];
        if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
            // Make sure it's not part of a typed suffix (e.g., "U8+" should split as "U8" and "+")
            // Check if the previous character is not a letter or digit (to avoid matching inside suffixes)
            const prev = s[i - 1];
            if (prev === undefined) continue;
            // If prev is a digit, space, or closing paren, this is likely an operator
            if ((prev >= "0" && prev <= "9") || prev === " " || prev === ")") {
                opIndex = i;
                op = ch;
                break;
            }
        }
    }

    if (opIndex === -1) {
        // No operator found, parse as single typed number
        return parseTypedNumber(s);
    }

    const leftStr = s.slice(0, opIndex).trim();
    const rightStr = s.slice(opIndex + 1).trim();

    const leftInfo = extractTypedInfo(leftStr);
    const rightInfo = extractTypedInfo(rightStr);

    const left = parseTypedNumber(leftStr);
    const right = parseTypedNumber(rightStr);

    let result = 0;
    switch (op) {
        case "+":
            result = left + right;
            break;
        case "-":
            result = left - right;
            break;
        case "*":
            result = left * right;
            break;
        case "/":
            if (right === 0) throw new Error("division by zero");
            result = Math.floor(left / right);
            break;
        default:
            return 0;
    }

    // If both operands have the same unsigned type, validate the result against that type
    if (leftInfo.typeSize > 0 && leftInfo.typeSize === rightInfo.typeSize) {
        validateUnsignedValue(result, leftInfo.typeSize);
    }

    return result;
}