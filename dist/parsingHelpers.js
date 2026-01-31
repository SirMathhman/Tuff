"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readBalanced = readBalanced;
exports.scanExpression = scanExpression;
exports.isKeywordAt = isKeywordAt;
const stringState_1 = require("./stringState");
function isAtTopLevel(state) {
    return state.paren === 0 && state.brace === 0 && state.bracket === 0;
}
function updateDepthState(ch, state, stopTokens) {
    if (ch === "(") {
        state.paren++;
        return { stop: false, handled: true };
    }
    if (ch === ")") {
        if (state.paren === 0 && (stopTokens === null || stopTokens === void 0 ? void 0 : stopTokens.includes(")"))) {
            return { stop: true, handled: true };
        }
        state.paren = Math.max(state.paren - 1, 0);
        return { stop: false, handled: true };
    }
    if (ch === "{") {
        state.brace++;
        return { stop: false, handled: true };
    }
    if (ch === "}") {
        if (state.brace === 0 && (stopTokens === null || stopTokens === void 0 ? void 0 : stopTokens.includes("}"))) {
            return { stop: true, handled: true };
        }
        state.brace = Math.max(state.brace - 1, 0);
        return { stop: false, handled: true };
    }
    if (ch === "[") {
        state.bracket++;
        return { stop: false, handled: true };
    }
    if (ch === "]") {
        if (state.bracket === 0 && (stopTokens === null || stopTokens === void 0 ? void 0 : stopTokens.includes("]"))) {
            return { stop: true, handled: true };
        }
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
function scanExpression(input, start, options) {
    var _a;
    const stringState = { inString: null, escaped: false };
    const depthState = { paren: 0, brace: 0, bracket: 0 };
    for (let i = start; i < input.length; i++) {
        const ch = input[i];
        if ((0, stringState_1.updateStringState)(ch, stringState)) {
            continue;
        }
        const depthResult = updateDepthState(ch, depthState, options.stopTokens);
        if (depthResult.stop) {
            return { expr: input.slice(start, i).trim(), end: i };
        }
        if (depthResult.handled) {
            continue;
        }
        if (isAtTopLevel(depthState)) {
            if (options.stopOnElse && isKeywordAt(input, i, "else")) {
                return { expr: input.slice(start, i).trim(), end: i };
            }
            if ((_a = options.stopTokens) === null || _a === void 0 ? void 0 : _a.includes(ch)) {
                return { expr: input.slice(start, i).trim(), end: i };
            }
        }
    }
    return { expr: input.slice(start).trim(), end: input.length };
}
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
