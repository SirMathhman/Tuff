import type { Result } from "./index";

const NUMBER_RE = /^[+-]?(\d+(\.\d+)?)/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

/**
 * Parses and evaluates an arithmetic expression of numbers with +, -, and *.
 * Left-associative; * binds tighter than + and -. Supports ( ) and { } groups.
 * "let name = expr;" bindings may appear at the top level or inside { } blocks
 * (scoped to the block), e.g. "let y = { let x = 2 + 3; x } * 4; y".
 * "let mut name = expr;" creates a mutable binding that can be reassigned
 * with "name = expr;", e.g. "let mut x = 0; x = 1; x".
 */
export function parseExpression(source: string): Result<number, Error> {
  let pos = 0;
  const scopes: Map<string, { value: number; mutable: boolean }>[] = [];

  const lookup = (
    name: string,
  ): { value: number; mutable: boolean } | undefined => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const v = scopes[i]?.get(name);
      if (v !== undefined) {
        return v;
      }
    }
    return undefined;
  };

  const findBindingScope = (
    name: string,
  ): Map<string, { value: number; mutable: boolean }> | undefined => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const scope = scopes[i];
      if (scope?.has(name)) {
        return scope;
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
    const binding = lookup(name);
    if (binding === undefined) {
      return {
        ok: false,
        error: new Error(
          `parseExpression: unknown identifier "${name}" in "${source}". ` +
            `Fix: bind it first with "let ${name} = <expr>;" at the top level or in an enclosing { } block.`,
        ),
      };
    }
    return { ok: true, value: binding.value };
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
        let mutable = false;
        if (source.startsWith("mut", pos)) {
          const afterMut = pos + 3;
          if (
            afterMut >= source.length ||
            !/[A-Za-z0-9_]/.test(source[afterMut] ?? "")
          ) {
            mutable = true;
            pos = afterMut;
            skipSpaces();
          }
        }
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
        scopes[scopes.length - 1]?.set(name, {
          value: valueResult.value,
          mutable,
        });
        return { ok: true, value: valueResult.value };
      }
    }
    return parseAssignment();
  };

  const parseAssignment = (): Result<number, Error> => {
    if (pos < source.length && /[A-Za-z_]/.test(source[pos] ?? "")) {
      const startPos = pos;
      const match = IDENT_RE.exec(source.slice(pos));
      const name = match?.[0] ?? "";
      pos += name.length;
      skipSpaces();
      if (source[pos] === "=") {
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
              `parseExpression: expected ";" after the assignment to "${name}" at position ${pos} in "${source}". ` +
                `Fix: end the assignment with ";" (e.g. "${name} = 1;").`,
            ),
          };
        }
        pos += 1;
        const scope = findBindingScope(name);
        if (!scope) {
          return {
            ok: false,
            error: new Error(
              `parseExpression: cannot assign to unknown identifier "${name}" in "${source}". ` +
                `Fix: bind it first with "let ${name} = <expr>;" or "let mut ${name} = <expr>;".`,
            ),
          };
        }
        const binding = scope.get(name);
        if (!binding?.mutable) {
          return {
            ok: false,
            error: new Error(
              `parseExpression: cannot assign to immutable binding "${name}" in "${source}". ` +
                `Fix: declare it with "let mut ${name} = <expr>;" to allow reassignment.`,
            ),
          };
        }
        scope.set(name, { value: valueResult.value, mutable: true });
        return { ok: true, value: valueResult.value };
      }
      pos = startPos;
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
