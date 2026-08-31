import type { AstNode } from "./ast.ts";
import type { EvalFailure } from "./errors.ts";
import type { Token } from "./lexer.ts";

export type ParseResult =
  | { ok: true; ast: AstNode }
  | { ok: false; error: EvalFailure };

export function parse(tokens: Token[]): ParseResult {
  // Grammar rule: empty input (only the end token) evaluates to 0.
  if (tokens.length === 1 && tokens[0]!.type === "end") {
    return { ok: true, ast: { type: "number", value: 0 } };
  }
  return new Parser(tokens).parseInput();
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  private next(): Token | undefined {
    return this.tokens[this.i];
  }

  private advance(): Token | undefined {
    return this.tokens[this.i++];
  }

  private parseNumber(): ParseResult {
    const tok = this.advance();
    if (tok === undefined || tok.type !== "number") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected a number",
          position: tok?.position ?? 0,
        },
      };
    }
    return { ok: true, ast: { type: "number", value: tok.value } };
  }

  // factor := number | ident | '(' expr ')' | block
  private parseFactor(): ParseResult {
    const tok = this.next();
    if (tok === undefined) {
      return this.parseNumber();
    }
    switch (tok.type) {
      case "ident":
        this.advance();
        return {
          ok: true,
          ast: { type: "ident", name: tok.value, position: tok.position },
        };
      case "lparen":
        return this.parseGrouped();
      case "lbrace":
        return this.parseBlock();
      default:
        return this.parseNumber();
    }
  }

  private parseGrouped(): ParseResult {
    this.advance();
    const inner = this.parseExpr();
    if (!inner.ok) {
      return inner;
    }
    const close = this.next();
    if (close === undefined || close.type !== "rparen") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected )",
          position: close?.position ?? 0,
        },
      };
    }
    this.advance();
    return { ok: true, ast: inner.ast };
  }

  // block := '{' letStmt* expr '}'
  private parseBlock(): ParseResult {
    this.advance(); // consume lbrace
    const result = this.parseLetSeq();
    if (!result.ok) {
      return result;
    }
    const close = this.next();
    if (close === undefined || close.type !== "rbrace") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected }",
          position: close?.position ?? 0,
        },
      };
    }
    this.advance();
    return result;
  }

  // letSeq := letStmt* expr — desugared into nested let nodes
  private parseLetSeq(): ParseResult {
    const stmts: { name: string; value: AstNode }[] = [];
    for (;;) {
      const tok = this.next();
      if (tok === undefined || tok.type !== "let") {
        break;
      }
      const stmt = this.parseLetStmt();
      if (!stmt.ok) {
        return stmt;
      }
      stmts.push({ name: stmt.name, value: stmt.value });
    }
    const bodyRes = this.parseExpr();
    if (!bodyRes.ok) {
      return bodyRes;
    }
    let ast: AstNode = bodyRes.ast;
    for (let k = stmts.length - 1; k >= 0; k--) {
      const stmt = stmts[k]!;
      ast = { type: "let", name: stmt.name, value: stmt.value, body: ast };
    }
    return { ok: true, ast };
  }

  // letStmt := let ident '=' expr ';'
  private parseLetStmt():
    | { ok: true; name: string; value: AstNode }
    | { ok: false; error: EvalFailure } {
    this.advance(); // consume let
    const nameTok = this.next();
    if (nameTok === undefined || nameTok.type !== "ident") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected a variable name",
          position: nameTok?.position ?? 0,
        },
      };
    }
    this.advance();
    const eq = this.next();
    if (eq === undefined || eq.type !== "equals") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected =",
          position: eq?.position ?? 0,
        },
      };
    }
    this.advance();
    const valueRes = this.parseExpr();
    if (!valueRes.ok) {
      return valueRes;
    }
    const semi = this.next();
    if (semi === undefined || semi.type !== "semicolon") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected ;",
          position: semi?.position ?? 0,
        },
      };
    }
    this.advance();
    return { ok: true, name: nameTok.value, value: valueRes.ast };
  }

  // term := factor ('*' factor)*, left-associative
  private parseTerm(): ParseResult {
    const left = this.parseFactor();
    if (!left.ok) {
      return left;
    }
    let ast = left.ast;
    for (;;) {
      const op = this.next();
      if (op === undefined || op.type !== "star") {
        break;
      }
      this.advance();
      const right = this.parseFactor();
      if (!right.ok) {
        return right;
      }
      ast = { type: "mul", left: ast, right: right.ast };
    }
    return { ok: true, ast };
  }

  // expr := term (('+' | '-') term)*, left-associative
  private parseExpr(): ParseResult {
    const left = this.parseTerm();
    if (!left.ok) {
      return left;
    }
    let ast = left.ast;
    for (;;) {
      const op = this.next();
      if (op === undefined || (op.type !== "plus" && op.type !== "minus")) {
        break;
      }
      this.advance();
      const right = this.parseTerm();
      if (!right.ok) {
        return right;
      }
      ast =
        op.type === "plus"
          ? { type: "add", left: ast, right: right.ast }
          : { type: "sub", left: ast, right: right.ast };
    }
    return { ok: true, ast };
  }

  // input := letStmt* expr
  parseInput(): ParseResult {
    const result = this.parseLetSeq();
    if (!result.ok) {
      return result;
    }
    const trailing = this.next();
    if (trailing === undefined || trailing.type !== "end") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected end of input",
          position: trailing?.position ?? 0,
        },
      };
    }
    return { ok: true, ast: result.ast };
  }
}
