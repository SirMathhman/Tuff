export type StringState = {
  inString: string | null;
  escaped: boolean;
};

export function updateStringState(ch: string, state: StringState): boolean {
  if (state.inString) {
    if (state.escaped) {
      state.escaped = false;
    } else if (ch === "\\") {
      state.escaped = true;
    } else if (ch === state.inString) {
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
