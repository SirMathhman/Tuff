/**
 * Interpret a string and return a Result<number, InterpretError>.
 * Use Result<T, E> instead of throwing errors.
 * Minimal rules for now:
 * - empty or whitespace-only -> 0
 * - numeric literal (integer or float) -> parsed number
 * - identifiers -> UndefinedIdentifier error
 * - otherwise -> InvalidInput error
 */
export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

export interface UndefinedIdentifierError {
  type: "UndefinedIdentifier";
  identifier: string;
}
export interface InvalidInputError {
  type: "InvalidInput";
  message: string;
}
export type InterpretError = UndefinedIdentifierError | InvalidInputError;

export interface NumToken {
  type: "num";
  value: number;
}
export interface OpToken {
  type: "op";
  value: string;
}
export interface IdToken {
  type: "id";
  value: string;
}
export type Token = NumToken | OpToken | IdToken;

function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}
function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}

// Parser moved to module scope so interpret remains small
/* eslint-disable no-restricted-syntax */
const parserScopes = new WeakMap<Parser, Record<string, number>[]>();

class Parser {
  private tokens: Token[];
  private idx = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
    parserScopes.set(this, []);
  }
  peek(): Token | undefined {
    const t = this.tokens;
    return t[this.idx];
  }
  consume(): Token | undefined {
    const t = this.tokens;
    return t[this.idx++];
  }

  private getScopes(): Record<string, number>[] {
    const s = parserScopes.get(this);
    if (!s) {
      const arr: Record<string, number>[] = [];
      parserScopes.set(this, arr);
      return arr;
    }
    return s;
  }

  private currentScope(): Record<string, number> | undefined {
    const s = this.getScopes();
    const ln = s.length;
    if (ln === 0) return undefined;
    return s[ln - 1];
  }

  private hasOwnProp(obj: Record<string, number>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  private lookupVar(name: string): number | undefined {
    const s = this.getScopes();
    const ln = s.length;
    for (let i = ln - 1; i >= 0; i--) {
      const scope = s[i];
      if (this.hasOwnProp(scope, name)) {
        return scope[name];
      }
    }
    return undefined;
  }

  private pushScope(): void {
    this.getScopes().push({});
  }

  private popScope(): void {
    this.getScopes().pop();
  }

  private isOpToken(tk: Token | undefined, v: string): boolean {
    return Boolean(tk && tk.type === "op" && tk.value === v);
  }

  private isIdToken(tk: Token | undefined): tk is IdToken {
    return Boolean(tk && tk.type === "id");
  }

  private consumeOptionalType(): Result<null, InterpretError> {
    const maybeColon = this.peek();
    if (this.isOpToken(maybeColon, ":")) {
      this.consume();
      const typeTok = this.consume();
      if (!this.isIdToken(typeTok)) {
        return err({
          type: "InvalidInput",
          message: "Expected type name after :",
        });
      }
    }
    return ok(null);
  }

  private consumeExpectedOp(
    value: string,
    message: string
  ): Result<null, InterpretError> {
    const tk = this.consume();
    if (!tk || tk.type !== "op" || tk.value !== value) {
      return err({ type: "InvalidInput", message });
    }
    return ok(null);
  }

  private parseLetDeclaration(): Result<number, InterpretError> {
    // assume current token is 'let'
    this.consume();
    const nameTok = this.consume();
    if (!nameTok || nameTok.type !== "id") {
      return err({
        type: "InvalidInput",
        message: "Expected identifier after let",
      });
    }
    const name = nameTok.value;

    const typeR = this.consumeOptionalType();
    if (!typeR.ok) return typeR;

    const eqR = this.consumeExpectedOp(
      "=",
      "Expected = in variable declaration"
    );
    if (!eqR.ok) return eqR;

    const valR = this.parseExpr();
    if (!valR.ok) return valR;

    const semiR = this.consumeExpectedOp(
      ";",
      "Missing ; after variable declaration"
    );
    if (!semiR.ok) return semiR;

    const top = this.currentScope();
    if (!top)
      return err({ type: "InvalidInput", message: "Invalid block scope" });
    top[name] = valR.value;
    return ok(valR.value);
  }

  parsePrimary(): Result<number, InterpretError> {
    const tk = this.peek();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });

    // parentheses
    if (tk.type === "op" && tk.value === "(") {
      return this.parseParenthesized();
    }

    // braces (block/grouping)
    if (tk.type === "op" && tk.value === "{") {
      return this.parseBraced();
    }

    // conditional: if (cond) consequent else alternative
    if (tk.type === "id" && tk.value === "if") {
      return this.parseIfExpression();
    }

    // literals and identifiers
    return this.parseLiteral();
  }

  parseParenthesized(): Result<number, InterpretError> {
    // assume current token is '('
    this.consume();
    const r = this.parseExpr();
    if (!r.ok) return r;
    const closing = this.consume();
    if (!closing || closing.type !== "op" || closing.value !== ")") {
      return err({
        type: "InvalidInput",
        message: "Missing closing parenthesis",
      });
    }
    return ok(r.value);
  }

  parseBraced(): Result<number, InterpretError> {
    // assume current token is '{'
    this.consume();
    this.pushScope();
    let lastVal = 0;

    while (true) {
      const p = this.peek();
      if (!p) {
        this.popScope();
        return err({ type: "InvalidInput", message: "Missing closing brace" });
      }

      if (this.isOpToken(p, "}")) {
        this.consume();
        this.popScope();
        return ok(lastVal);
      }

      if (this.isIdToken(p) && p.value === "let") {
        const declR = this.parseLetDeclaration();
        if (!declR.ok) {
          this.popScope();
          return declR;
        }
        lastVal = declR.value;
      } else {
        const exprR = this.parseExpr();
        if (!exprR.ok) {
          this.popScope();
          return exprR;
        }
        lastVal = exprR.value;

        const next = this.peek();
        if (this.isOpToken(next, ";")) {
          this.consume();
          // loop naturally continues
        } else if (this.isOpToken(next, "}")) {
          // next iteration will handle closing brace
        } else {
          this.popScope();
          return err({
            type: "InvalidInput",
            message: "Unexpected token in block",
          });
        }
      }
    }
  }

  parseIfExpression(): Result<number, InterpretError> {
    // assume current token is 'if'
    this.consume();
    const open = this.consume();
    if (!open || open.type !== "op" || open.value !== "(") {
      return err({ type: "InvalidInput", message: "Expected ( after if" });
    }
    const cond = this.parseExpr();
    if (!cond.ok) return cond;
    const close = this.consume();
    if (!close || close.type !== "op" || close.value !== ")") {
      return err({
        type: "InvalidInput",
        message: "Expected ) after condition",
      });
    }
    const cons = this.parseExpr();
    if (!cons.ok) return cons;
    const e = this.consume();
    if (!e || e.type !== "id" || e.value !== "else") {
      return err({
        type: "InvalidInput",
        message: "Expected else in conditional",
      });
    }
    const alt = this.parseExpr();
    if (!alt.ok) return alt;
    return ok(cond.value !== 0 ? cons.value : alt.value);
  }

  parseLiteral(): Result<number, InterpretError> {
    const tk = this.peek();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });

    // boolean literals
    if (tk.type === "id" && (tk.value === "true" || tk.value === "false")) {
      this.consume();
      return ok(tk.value === "true" ? 1 : 0);
    }

    // numeric literal
    if (tk.type === "num") {
      this.consume();
      return ok(tk.value);
    }

    // identifier: try variable lookup in scope
    if (tk.type === "id") {
      const v = this.lookupVar(tk.value);
      if (v !== undefined) {
        this.consume();
        return ok(v);
      }
      return err({ type: "UndefinedIdentifier", identifier: tk.value });
    }

    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  parseFactor(): Result<number, InterpretError> {
    const tk = this.peek();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });

    if (tk.type === "op" && tk.value === "-") {
      this.consume();
      const r = this.parseFactor();
      return r.ok ? ok(-r.value) : err(r.error);
    }

    return this.parsePrimary();
  }

  parseTerm(): Result<number, InterpretError> {
    const left = this.parseFactor();
    if (!left.ok) return left;
    let val = left.value;
    let p = this.peek();
    while (p && p.type === "op" && (p.value === "*" || p.value === "/")) {
      const opToken = this.consume();
      if (!opToken)
        return err({
          type: "InvalidInput",
          message: "Unable to interpret input",
        });
      const op = opToken.value;
      const right = this.parseFactor();
      if (!right.ok) return right;
      const rhs = right.value;
      val = op === "*" ? val * rhs : val / rhs;
      p = this.peek();
    }
    return ok(val);
  }

  parseExpr(): Result<number, InterpretError> {
    const left = this.parseTerm();
    if (!left.ok) return left;
    let val = left.value;
    let p = this.peek();
    while (p && p.type === "op" && (p.value === "+" || p.value === "-")) {
      const opToken = this.consume();
      if (!opToken)
        return err({
          type: "InvalidInput",
          message: "Unable to interpret input",
        });
      const op = opToken.value;
      const right = this.parseTerm();
      if (!right.ok) return right;
      const rhs = right.value;
      val = op === "+" ? val + rhs : val - rhs;
      p = this.peek();
    }
    return ok(val);
  }

  parse(): Result<number, InterpretError> {
    const result = this.parseExpr();
    if (!result.ok) return result;
    const t = this.tokens;
    const len = t.length;
    if (this.idx !== len)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    if (!Number.isFinite(result.value))
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    return result;
  }
}
/* eslint-enable no-restricted-syntax */

export function interpret(input: string): Result<number, InterpretError> {
  const s = input.trim();
  if (s === "") return ok(0);

  // numeric literal (integer or decimal)
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return ok(Number(s));
  }

  // bare identifiers -> undefined identifier error
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    return err({ type: "UndefinedIdentifier", identifier: s });
  }

  // tokenize numbers, identifiers, parentheses/braces, operators and punctuation
  const tokenRe = /\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/(){}:;=]/g;
  const raw = s.match(tokenRe);
  if (!raw)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  // ensure no unexpected characters (allow parentheses, braces, letters, and punctuation : ; =)
  const compact = s.replace(/\s+/g, "");
  if (compact.match(/[^+\-*/0-9.(){}:;=A-Za-z_]/)) {
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  // helpers to create strongly-typed tokens (avoid 'as' assertions)
  function makeOpToken(v: string): OpToken {
    return { type: "op", value: v };
  }
  function makeIdToken(v: string): IdToken {
    return { type: "id", value: v };
  }
  function makeNumToken(n: number): NumToken {
    return { type: "num", value: n };
  }

  const tokens: Token[] = raw.map((t) => {
    if (/^[+\-*/(){}:;=]$/.test(t)) return makeOpToken(t);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return makeIdToken(t);
    return makeNumToken(Number(t));
  });

  const parser = new Parser(tokens);
  return parser.parse();
}
