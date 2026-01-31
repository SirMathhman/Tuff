"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWordChar = isWordChar;
exports.isKeywordAt = isKeywordAt;
exports.isAtTopLevel = isAtTopLevel;
exports.updateDepthState = updateDepthState;
exports.readBalanced = readBalanced;
exports.readIdentifier = readIdentifier;
exports.skipWhitespace = skipWhitespace;
const stringState_1 = require("./stringState");
function isWordChar(ch) {
    return /[A-Za-z0-9_]/.test(ch);
}
function isKeywordAt(input, idx, keyword) {
    if (input.slice(idx, idx + keyword.length) !== keyword)
        return false;
    const before = idx > 0 ? input[idx - 1] : "";
    const after = idx + keyword.length < input.length ? input[idx + keyword.length] : "";
    if (before && isWordChar(before))
        return false;
    if (after && isWordChar(after))
        return false;
    return true;
}
function isAtTopLevel(state) {
    return state.paren === 0 && state.brace === 0 && state.bracket === 0;
}
function updateDepthState(ch, state, stopTokens) {
    if (ch === "(") {
        state.paren++;
        return { stop: false, handled: true };
    }
    if (ch === ")") {
        if (state.paren === 0 && (stopTokens === null || stopTokens === void 0 ? void 0 : stopTokens.includes(")")))
            return { stop: true, handled: true };
        state.paren = Math.max(state.paren - 1, 0);
        return { stop: false, handled: true };
    }
    if (ch === "{") {
        state.brace++;
        return { stop: false, handled: true };
    }
    if (ch === "}") {
        if (state.brace === 0 && (stopTokens === null || stopTokens === void 0 ? void 0 : stopTokens.includes("}")))
            return { stop: true, handled: true };
        state.brace = Math.max(state.brace - 1, 0);
        return { stop: false, handled: true };
    }
    if (ch === "[") {
        state.bracket++;
        return { stop: false, handled: true };
    }
    if (ch === "]") {
        if (state.bracket === 0 && (stopTokens === null || stopTokens === void 0 ? void 0 : stopTokens.includes("]")))
            return { stop: true, handled: true };
        state.bracket = Math.max(state.bracket - 1, 0);
        return { stop: false, handled: true };
    }
    return { stop: false, handled: false };
}
function readBalanced(input, start, open, close) {
    if (input[start] !== open)
        return null;
    let depth = 1;
    const stringState = { inString: null, escaped: false };
    let i = start + 1;
    while (i < input.length) {
        const ch = input[i];
        if ((0, stringState_1.updateStringState)(ch, stringState)) {
            i++;
            continue;
        }
        if (ch === open) {
            depth++;
        }
        else if (ch === close) {
            depth--;
            if (depth === 0) {
                return { content: input.slice(start + 1, i), end: i + 1 };
            }
        }
        i++;
    }
    return null;
}
function readIdentifier(input, start) {
    const match = input.slice(start).match(/^([A-Za-z_]\w*)/);
    if (!match)
        return null;
    const [name] = match;
    return { name, end: start + name.length };
}
function skipWhitespace(input, start) {
    let idx = start;
    while (idx < input.length && /\s/.test(input[idx]))
        idx++;
    return idx;
}
