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
class Parser {
  private tokens: Token[];
  private idx = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
  peek(): Token | undefined {
    const t = this.tokens;
    return t[this.idx];
  }
  consume(): Token | undefined {
    const t = this.tokens;
    return t[this.idx++];
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

    // conditional: if (cond) consequent else alternative
    if (tk.type === "id" && tk.value === "if") {
      return this.parseIfExpression();
    }

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

    // unknown identifier
    if (tk.type === "id") {
      return err({ type: "UndefinedIdentifier", identifier: tk.value });
    }

    return err({ type: "InvalidInput", message: "Unable to interpret input" });
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

  // tokenize numbers, identifiers, parentheses and operators
  const tokenRe = /\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/()]/g;
  const raw = s.match(tokenRe);
  if (!raw)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  // ensure no unexpected characters (allow parentheses and letters)
  const compact = s.replace(/\s+/g, "");
  if (compact.match(/[^+\-*/0-9.()A-Za-z_]/)) {
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  const tokens: Token[] = raw.map((t) => {
    if (/^[+\-*/() ]$/.test(t)) return { type: "op", value: t } as OpToken;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t))
      return { type: "id", value: t } as IdToken;
    return { type: "num", value: Number(t) } as NumToken;
  });

  const parser = new Parser(tokens);
  return parser.parse();
}
