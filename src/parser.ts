import type { AstNode } from "./ast.ts";
import type { EvalFailure } from "./errors.ts";
import type { Token } from "./lexer.ts";
import {
  parseAssignStmt,
  parseDerefAssignRest,
  parseLetStmt,
  type Stmt,
} from "./parser/stmts.ts";

export type ParseResult =
  | { ok: true; ast: AstNode }
  | { ok: false; error: EvalFailure };

export function parse(tokens: Token[]): ParseResult {
  // Grammar rule: empty input (only the end token) evaluates to 0.
  if (tokens.length === 1 && tokens[0]!.type === "end") {
    return { ok: true, ast: { type: "number", value: 0, position: 0 } };
  }
  return new Parser(tokens).parseInput();
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  next(): Token | undefined {
    return this.tokens[this.i];
  }

  advance(): Token | undefined {
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
    return {
      ok: true,
      ast: { type: "number", value: tok.value, position: tok.position },
    };
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
      case "true":
        this.advance();
        return {
          ok: true,
          ast: { type: "number", value: 1, position: tok.position },
        };
      case "false":
        this.advance();
        return {
          ok: true,
          ast: { type: "number", value: 0, position: tok.position },
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
    const inner = this.parseOrExpr();
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

  // letSeq := stmt* expr — desugared into nested let/assign nodes
  private parseLetSeq(): ParseResult {
    const stmts: Stmt[] = [];
    for (;;) {
      const tok = this.next();
      if (tok === undefined) {
        break;
      }
      if (tok.type === "let") {
        const stmt = parseLetStmt(this);
        if (!stmt.ok) {
          return stmt;
        }
        stmts.push(stmt.value);
        continue;
      }
      if (tok.type === "ident") {
        // Only an ident followed by '=' is an assignment statement;
        // otherwise it is the body expression.
        const after = this.tokens[this.i + 1];
        if (after === undefined || after.type !== "equals") {
          break;
        }
        const stmt = parseAssignStmt(this, tok);
        if (!stmt.ok) {
          return stmt;
        }
        stmts.push(stmt.value);
        continue;
      }
      if (tok.type === "star") {
        // A deref-assignment statement is '*' <ref> '=' expr ';'.
        // Consume the '*', parse the reference operand, then check for '=';
        // backtrack if it is not a statement (it is the body expression).
        const saved = this.i;
        this.advance(); // consume '*'
        const operand = this.parseUnary();
        if (!operand.ok) {
          return operand;
        }
        const eq = this.next();
        if (eq === undefined || eq.type !== "equals") {
          this.i = saved;
          break;
        }
        const stmt = parseDerefAssignRest(this, operand.ast, tok.position);
        if (!stmt.ok) {
          return stmt;
        }
        stmts.push(stmt.value);
        continue;
      }
      break;
    }
    const bodyRes = this.parseOrExpr();
    if (!bodyRes.ok) {
      return bodyRes;
    }
    let ast: AstNode = bodyRes.ast;
    for (let k = stmts.length - 1; k >= 0; k--) {
      const stmt = stmts[k]!;
      ast =
        stmt.kind === "let"
          ? {
              type: "let",
              name: stmt.name,
              mutable: stmt.mutable,
              value: stmt.value,
              body: ast,
              position: stmt.position,
            }
          : stmt.kind === "assign"
            ? {
                type: "assign",
                name: stmt.name,
                position: stmt.position,
                value: stmt.value,
                body: ast,
              }
            : {
                type: "derefAssign",
                operand: stmt.operand,
                value: stmt.value,
                body: ast,
                position: stmt.position,
              };
    }
    return { ok: true, ast };
  }

  // unary := '&' ident | '*' unary | factor
  private parseUnary(): ParseResult {
    const tok = this.next();
    if (tok === undefined) {
      return this.parseFactor();
    }
    if (tok.type === "amp") {
      this.advance();
      let mut = false;
      const mutTok = this.next();
      if (mutTok !== undefined && mutTok.type === "mut") {
        mut = true;
        this.advance();
      }
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
      return {
        ok: true,
        ast: {
          type: "ref",
          target: nameTok.value,
          mut,
          position: tok.position,
        },
      };
    }
    if (tok.type === "star") {
      this.advance();
      const inner = this.parseUnary();
      if (!inner.ok) {
        return inner;
      }
      return {
        ok: true,
        ast: { type: "deref", operand: inner.ast, position: tok.position },
      };
    }
    return this.parseFactor();
  }

  // term := unary ('*' unary)*, left-associative
  private parseTerm(): ParseResult {
    const left = this.parseUnary();
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
      const right = this.parseUnary();
      if (!right.ok) {
        return right;
      }
      ast = { type: "mul", left: ast, right: right.ast, position: op.position };
    }
    return { ok: true, ast };
  }

  // orExpr := expr ('||' expr)*, left-associative
  parseOrExpr(): ParseResult {
    const left = this.parseExpr();
    if (!left.ok) {
      return left;
    }
    let ast = left.ast;
    for (;;) {
      const op = this.next();
      if (op === undefined || op.type !== "pipe") {
        break;
      }
      this.advance();
      const right = this.parseExpr();
      if (!right.ok) {
        return right;
      }
      ast = { type: "or", left: ast, right: right.ast, position: op.position };
    }
    return { ok: true, ast };
  }

  // expr := term (('+' | '-') term)*, left-associative
  parseExpr(): ParseResult {
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
          ? { type: "add", left: ast, right: right.ast, position: op.position }
          : { type: "sub", left: ast, right: right.ast, position: op.position };
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
