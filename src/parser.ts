import type { TuffError } from "./errors.ts";

/**
 * A numeric literal expression.
 */
export interface NumberExpr {
  type: "Number";
  value: number;
  pos: number;
}

/**
 * An identifier reference expression.
 */
export interface IdentifierExpr {
  type: "Identifier";
  name: string;
  pos: number;
}

/**
 * An expression: a number literal or an identifier reference.
 */
export type Expr = NumberExpr | IdentifierExpr;

/**
 * A `let` (optionally `mut`) variable declaration.
 */
export interface LetDecl {
  type: "LetDecl";
  mutable: boolean;
  name: string;
  value: Expr;
}

/**
 * An assignment to a variable.
 */
export interface Assign {
  type: "Assign";
  name: string;
  value: Expr;
  pos: number;
}

/**
 * A return statement.
 */
export interface Return {
  type: "Return";
  value: Expr;
}

/**
 * A statement in the program.
 */
export type Stmt = LetDecl | Assign | Return;

/**
 * A parsed program: an ordered list of statements.
 */
export interface Program {
  stmts: Stmt[];
}

/**
 * A successful parse result.
 */
export interface ParseOk {
  ok: true;
  program: Program;
}

/**
 * A failed parse result.
 */
export interface ParseErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of parsing: a program or a structured error.
 */
export type ParseResult = ParseOk | ParseErr;

/**
 * A successful tokenize result.
 */
interface TokenizeOk {
  ok: true;
  tokens: Token[];
}

/**
 * A successful statement parse result.
 */
interface ParseStmtOk {
  ok: true;
  stmt: Stmt;
}

/**
 * A successful expression parse result.
 */
interface ParseExprOk {
  ok: true;
  expr: Expr;
}

/**
 * A lexical token with its source position.
 */
interface Token {
  kind: "number" | "ident" | "keyword" | "punct";
  value: string;
  pos: number;
}

const KEYWORDS = new Set(["let", "mut", "return"]);

/**
 * Build a structured parse error.
 *
 * @param message - Human-readable description of the failure.
 * @param position - Zero-based offset of the failure in the source.
 * @returns The structured error.
 */
function parseError(message: string, position: number): TuffError {
  return { type: "ParseError", message, position };
}

/**
 * Tokenize source text into a flat token list.
 *
 * @param input - The source text.
 * @returns The tokens, or a structured parse error.
 */
function tokenize(
  input: string,
): TokenizeOk | ParseErr {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      let j = i;
      if (input[j] === "-") j++;
      while (j < input.length && /[0-9.]/.test(input[j] ?? "")) j++;
      const text = input.slice(i, j);
      if (!/^-?\d+(\.\d+)?$/.test(text)) {
        return { ok: false, error: parseError(`Invalid number: ${text}`, i) };
      }
      tokens.push({ kind: "number", value: text, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j] ?? "")) j++;
      const text = input.slice(i, j);
      tokens.push({
        kind: KEYWORDS.has(text) ? "keyword" : "ident",
        value: text,
        pos: i,
      });
      i = j;
      continue;
    }
    if (ch === "=" || ch === ";") {
      tokens.push({ kind: "punct", value: ch, pos: i });
      i++;
      continue;
    }
    return { ok: false, error: parseError(`Unexpected character: ${ch}`, i) };
  }
  return { ok: true, tokens };
}

/**
 * Recursive-descent parser over a token list.
 */
class Parser {
  private idx = 0;

  constructor(private readonly tokens: Token[]) {}

  /**
   * Parse the full program: statements separated by `;`.
   *
   * @returns The program, or a structured parse error.
   */
  parseProgram(): ParseResult {
    const stmts: Stmt[] = [];
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.value === ";") {
        this.next();
        continue;
      }
      const r = this.parseStmt();
      if (!r.ok) return r;
      stmts.push(r.stmt);
      if (!this.atEnd()) {
        const sep = this.next();
        if (sep.value !== ";") {
          return {
            ok: false,
            error: parseError("Expected ';' after statement", sep.pos),
          };
        }
      }
    }
    return { ok: true, program: { stmts } };
  }

  /**
   * Parse a single statement.
   *
   * @returns The statement, or a structured parse error.
   */
  private parseStmt(): ParseStmtOk | ParseErr {
    const t = this.peek();
    if (t.kind === "keyword" && t.value === "let") {
      return this.parseLetDecl();
    }
    if (t.kind === "keyword" && t.value === "return") {
      return this.parseReturn();
    }
    if (t.kind === "ident") {
      return this.parseAssign();
    }
    return {
      ok: false,
      error: parseError(`Unexpected token: ${t.value}`, t.pos),
    };
  }

  /**
   * Parse a `let` (optionally `mut`) declaration.
   *
   * @returns The declaration, or a structured parse error.
   */
  private parseLetDecl(): ParseStmtOk | ParseErr {
    this.next();
    let mutable = false;
    const maybeMut = this.peek();
    if (maybeMut.kind === "keyword" && maybeMut.value === "mut") {
      this.next();
      mutable = true;
    }
    const nameTok = this.next();
    if (nameTok?.kind !== "ident") {
      return {
        ok: false,
        error: parseError(
          "Expected variable name after 'let'",
          nameTok?.pos ?? 0,
        ),
      };
    }
    const eq = this.next();
    if (eq?.value !== "=") {
      return {
        ok: false,
        error: parseError(
          "Expected '=' after variable name",
          eq?.pos ?? nameTok.pos,
        ),
      };
    }
    const value = this.parseExpr();
    if (!value.ok) return value;
    return {
      ok: true,
      stmt: {
        type: "LetDecl",
        mutable,
        name: nameTok.value,
        value: value.expr,
      },
    };
  }

  /**
   * Parse a `return` statement.
   *
   * @returns The statement, or a structured parse error.
   */
  private parseReturn(): ParseStmtOk | ParseErr {
    this.next();
    const value = this.parseExpr();
    if (!value.ok) return value;
    return { ok: true, stmt: { type: "Return", value: value.expr } };
  }

  /**
   * Parse an assignment statement.
   *
   * @returns The statement, or a structured parse error.
   */
  private parseAssign(): ParseStmtOk | ParseErr {
    const nameTok = this.next();
    const eq = this.next();
    if (eq?.value !== "=") {
      return {
        ok: false,
        error: parseError(
          "Expected '=' after identifier",
          eq?.pos ?? nameTok.pos,
        ),
      };
    }
    const value = this.parseExpr();
    if (!value.ok) return value;
    return {
      ok: true,
      stmt: {
        type: "Assign",
        name: nameTok.value,
        value: value.expr,
        pos: nameTok.pos,
      },
    };
  }

  /**
   * Parse an expression: a number literal or an identifier.
   *
   * @returns The expression, or a structured parse error.
   */
  private parseExpr(): ParseExprOk | ParseErr {
    const t = this.peek();
    if (t.kind === "number") {
      this.next();
      return {
        ok: true,
        expr: { type: "Number", value: Number(t.value), pos: t.pos },
      };
    }
    if (t.kind === "ident") {
      this.next();
      return {
        ok: true,
        expr: { type: "Identifier", name: t.value, pos: t.pos },
      };
    }
    return {
      ok: false,
      error: parseError(`Expected expression, got: ${t.value}`, t.pos),
    };
  }

  private peek(): Token {
    return this.tokens[this.idx] as Token;
  }

  private next(): Token {
    const t = this.tokens[this.idx] as Token;
    this.idx++;
    return t;
  }

  private atEnd(): boolean {
    return this.idx >= this.tokens.length;
  }
}

/**
 * Parse source text into a program AST.
 *
 * @param input - The source text.
 * @returns The program, or a structured parse error.
 */
export function parse(input: string): ParseResult {
  const tok = tokenize(input);
  if (!tok.ok) return tok;
  return new Parser(tok.tokens).parseProgram();
}
