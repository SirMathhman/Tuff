"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStringState = updateStringState;
function updateStringState(ch, state) {
    if (state.inString) {
        if (state.escaped) {
            state.escaped = false;
        }
        else if (ch === "\\") {
            state.escaped = true;
        }
        else if (ch === state.inString) {
            state.inString = null;
        }
        return true;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
        state.inString = ch;
        return true;
    }
    return false;
}
