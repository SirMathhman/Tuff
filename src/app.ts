export function interpret(input: string): number {
    const s = input.trim();
    if (s === "") return 0;

    // Parse a leading numeric prefix without using regular expressions.
    let i = 0;
    const len = s.length;

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

    if (hasDigits) {
        const numStr = s.slice(0, i);
        const n = Number(numStr);

        // If there's a suffix (e.g., "U8") and it indicates unsigned (starts with 'U' or 'u'),
        // negative values are invalid and should throw an error. Also validate size-specific ranges (e.g., U8 <= 255).
        const suffix = s.slice(i);
        const first = suffix[0];
        if ((first === "U" || first === "u") && n < 0) {
            throw new Error("negative value with unsigned suffix");
        }

        if (first === "U" || first === "u") {
            // Parse digits after the 'U' without regex
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

            if (sizeStr.length > 0) {
                const size = Number(sizeStr);
                if (size === 8) {
                    if (n > 255) throw new RangeError(`value ${n} out of range for U8`);
                } else if (size === 16) {
                    if (n > 65535) throw new RangeError(`value ${n} out of range for U16`);
                } else if (size === 32) {
                    if (n > 4294967295) throw new RangeError(`value ${n} out of range for U32`);
                } else if (size === 64) {
                    // U64 overflow check: use MAX_SAFE_INTEGER as a conservative bound
                    if (n > Number.MAX_SAFE_INTEGER) throw new RangeError(`value ${n} out of range for U64`);
                }
            }
        }

        return Number.isFinite(n) ? n : 0;
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}