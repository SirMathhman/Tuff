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
        return Number.isFinite(n) ? n : 0;
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}