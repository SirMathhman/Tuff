import type { Result } from "./index";

const NUMBER_RE = /^[+-]?(\d+(\.\d+)?)/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

/**
 * Parses and evaluates an arithmetic expression of numbers with +, -, and *.
 * Left-associative; * binds tighter than + and -. Supports ( ) and { } groups.
 * "let name = expr;" bindings may appear at the top level or inside { } blocks
 * (scoped to the block), e.g. "let y = { let x = 2 + 3; x } * 4; y".
 */
export function parseExpression(source: string): Result<number, Error> {
  let pos = 0;
  const scopes: Map<string, number>[] = [];

  const lookup = (name: string): number | undefined => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const v = scopes[i]?.get(name);
      if (v !== undefined) {
        return v;
      }
    }
    return undefined;
  };

  const skipSpaces = (): void => {
    while (pos < source.length && source[pos] === " ") {
      pos += 1;
    }
  };

  const parseNumber = (): Result<number, Error> => {
    const match = NUMBER_RE.exec(source.slice(pos));
    if (!match) {
      return {
        ok: false,
        error: new Error(
          `parseExpression: expected a number at position ${pos} in "${source}". ` +
            `Fix: put a number (e.g. "1" or "2.5") where the operator or expression begins.`,
        ),
      };
    }
    pos += match[0].length;
    return { ok: true, value: Number(match[0]) };
  };

  const parseIdentifier = (): Result<string, Error> => {
    const match = IDENT_RE.exec(source.slice(pos));
    if (!match) {
      return {
        ok: false,
        error: new Error(
          `parseExpression: expected an identifier at position ${pos} in "${source}". ` +
            `Fix: use a letter or underscore followed by letters, digits, or underscores (e.g. "x").`,
        ),
      };
    }
    const name = match[0];
    pos += name.length;
    return { ok: true, value: name };
  };

  const resolveIdentifier = (name: string): Result<number, Error> => {
    const value = lookup(name);
    if (value === undefined) {
      return {
        ok: false,
        error: new Error(
          `parseExpression: unknown identifier "${name}" in "${source}". ` +
            `Fix: bind it first with "let ${name} = <expr>;" in an enclosing { } block.`,
        ),
      };
    }
    return { ok: true, value };
  };

  const parseStatement = (): Result<number, Error> => {
    skipSpaces();
    if (source.startsWith("let", pos)) {
      const afterLet = pos + 3;
      if (
        afterLet < source.length &&
        !/[A-Za-z0-9_]/.test(source[afterLet] ?? "")
      ) {
        pos = afterLet;
        skipSpaces();
        const nameResult = parseIdentifier();
        if (!nameResult.ok) {
          return nameResult;
        }
        const name = nameResult.value;
        skipSpaces();
        if (source[pos] !== "=") {
          return {
            ok: false,
            error: new Error(
              `parseExpression: expected "=" after "let ${name}" at position ${pos} in "${source}". ` +
                `Fix: write the binding as "let ${name} = <expr>;".`,
            ),
          };
        }
        pos += 1;
        const valueResult = parseAdditive();
        if (!valueResult.ok) {
          return valueResult;
        }
        skipSpaces();
        if (source[pos] !== ";") {
          return {
            ok: false,
            error: new Error(
              `parseExpression: expected ";" after the "let ${name}" binding at position ${pos} in "${source}". ` +
                `Fix: end the binding with ";" (e.g. "let ${name} = 1;").`,
            ),
          };
        }
        pos += 1;
        scopes[scopes.length - 1]?.set(name, valueResult.value);
        return { ok: true, value: valueResult.value };
      }
    }
    return parseAdditive();
  };

  const parseBlock = (): Result<number, Error> => {
    scopes.push(new Map());
    let last: Result<number, Error> = {
      ok: false,
      error: new Error(
        `parseExpression: empty block in "${source}". ` +
          `Fix: put at least one expression or "let" binding inside the { } block.`,
      ),
    };
    for (;;) {
      skipSpaces();
      if (pos >= source.length || source[pos] === "}") {
        break;
      }
      const stmt = parseStatement();
      if (!stmt.ok) {
        scopes.pop();
        return stmt;
      }
      last = stmt;
      skipSpaces();
      if (source[pos] === ";") {
        pos += 1;
      }
    }
    scopes.pop();
    return last;
  };

  const parseAdditive = (): Result<number, Error> => {
    const first = parseTerm();
    if (!first.ok) {
      return first;
    }
    let value = first.value;
    for (;;) {
      skipSpaces();
      if (
        pos >= source.length ||
        source[pos] === ")" ||
        source[pos] === "}" ||
        source[pos] === ";"
      ) {
        return { ok: true, value };
      }
      const op = source[pos];
      if (op !== "+" && op !== "-") {
        return {
          ok: false,
          error: new Error(
            `parseExpression: unexpected character "${op}" at position ${pos} in "${source}". ` +
              `Fix: use only numbers, "+", "-", "*", and ( ) or { } groups (e.g. "(2 + 3) * 4").`,
          ),
        };
      }
      pos += 1;
      skipSpaces();
      const next = parseTerm();
      if (!next.ok) {
        return next;
      }
      value = op === "+" ? value + next.value : value - next.value;
    }
  };

  const parseFactor = (): Result<number, Error> => {
    skipSpaces();
    const open = source[pos];
    if (open === "{") {
      pos += 1;
      const inner = parseBlock();
      if (!inner.ok) {
        return inner;
      }
      skipSpaces();
      if (pos >= source.length || source[pos] !== "}") {
        return {
          ok: false,
          error: new Error(
            `parseExpression: expected "}" at position ${pos} in "${source}". ` +
              `Fix: close the block with "}" (e.g. "{ let x = 2 + 3; x }").`,
          ),
        };
      }
      pos += 1;
      return { ok: true, value: inner.value };
    }
    if (open === "(") {
      pos += 1;
      const inner = parseAdditive();
      if (!inner.ok) {
        return inner;
      }
      skipSpaces();
      if (pos >= source.length || source[pos] !== ")") {
        return {
          ok: false,
          error: new Error(
            `parseExpression: expected ")" at position ${pos} in "${source}". ` +
              `Fix: close the group with ")" (e.g. "(2 + 3)").`,
          ),
        };
      }
      pos += 1;
      return { ok: true, value: inner.value };
    }
    if (pos < source.length && /[A-Za-z_]/.test(source[pos] ?? "")) {
      const match = IDENT_RE.exec(source.slice(pos));
      const name = match?.[0] ?? "";
      pos += name.length;
      return resolveIdentifier(name);
    }
    return parseNumber();
  };

  const parseTerm = (): Result<number, Error> => {
    const first = parseFactor();
    if (!first.ok) {
      return first;
    }
    let value = first.value;
    for (;;) {
      skipSpaces();
      if (pos >= source.length || source[pos] !== "*") {
        return { ok: true, value };
      }
      pos += 1;
      skipSpaces();
      const next = parseFactor();
      if (!next.ok) {
        return next;
      }
      value = value * next.value;
    }
  };

  const parseProgram = (): Result<number, Error> => {
    scopes.push(new Map());
    let last: Result<number, Error> = {
      ok: false,
      error: new Error(
        `parseExpression: empty program in "${source}". ` +
          `Fix: provide an expression or a "let" binding.`,
      ),
    };
    for (;;) {
      skipSpaces();
      if (pos >= source.length) {
        break;
      }
      const stmt = parseStatement();
      if (!stmt.ok) {
        scopes.pop();
        return stmt;
      }
      last = stmt;
      skipSpaces();
      if (source[pos] === ";") {
        pos += 1;
      }
    }
    scopes.pop();
    return last;
  };

  return parseProgram();
}
