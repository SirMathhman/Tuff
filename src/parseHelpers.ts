import { updateStringState, type StringState } from "./stringState";

export type DepthState = {
  paren: number;
  brace: number;
  bracket: number;
};

export function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

export function isKeywordAt(input: string, idx: number, keyword: string): boolean {
  if (input.slice(idx, idx + keyword.length) !== keyword) return false;
  const before = idx > 0 ? input[idx - 1] : "";
  const after =
    idx + keyword.length < input.length ? input[idx + keyword.length] : "";
  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
}

export function isAtTopLevel(state: DepthState): boolean {
  return state.paren === 0 && state.brace === 0 && state.bracket === 0;
}

export function updateDepthState(
  ch: string,
  state: DepthState,
  stopTokens: string[] | undefined,
): { stop: boolean; handled: boolean } {
  if (ch === "(") {
    state.paren++;
    return { stop: false, handled: true };
  }
  if (ch === ")") {
    if (state.paren === 0 && stopTokens?.includes(")"))
      return { stop: true, handled: true };
    state.paren = Math.max(state.paren - 1, 0);
    return { stop: false, handled: true };
  }
  if (ch === "{") {
    state.brace++;
    return { stop: false, handled: true };
  }
  if (ch === "}") {
    if (state.brace === 0 && stopTokens?.includes("}"))
      return { stop: true, handled: true };
    state.brace = Math.max(state.brace - 1, 0);
    return { stop: false, handled: true };
  }
  if (ch === "[") {
    state.bracket++;
    return { stop: false, handled: true };
  }
  if (ch === "]") {
    if (state.bracket === 0 && stopTokens?.includes("]"))
      return { stop: true, handled: true };
    state.bracket = Math.max(state.bracket - 1, 0);
    return { stop: false, handled: true };
  }
  return { stop: false, handled: false };
}

export function readBalanced(
  input: string,
  start: number,
  open: string,
  close: string,
): { content: string; end: number } | null {
  if (input[start] !== open) return null;
  let depth = 1;
  const stringState: StringState = { inString: null, escaped: false };
  let i = start + 1;
  while (i < input.length) {
    const ch = input[i];
    if (updateStringState(ch, stringState)) {
      i++;
      continue;
    }

    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return { content: input.slice(start + 1, i), end: i + 1 };
      }
    }
    i++;
  }
  return null;
}

export function readIdentifier(
  input: string,
  start: number,
): { name: string; end: number } | null {
  const match = input.slice(start).match(/^([A-Za-z_]\w*)/);
  if (!match) return null;
  const [name] = match;
  return { name, end: start + name.length };
}

export function skipWhitespace(input: string, start: number): number {
  let idx = start;
  while (idx < input.length && /\s/.test(input[idx])) idx++;
  return idx;
}
