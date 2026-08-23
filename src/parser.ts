import type { EvalError, Position } from "./errors.ts";
import type { Token, TokenKind } from "./lexer.ts";
import { Err, Ok, andThen } from "./result.ts";
import type { Result } from "./result.ts";

export type Expr =
  | { readonly type: "number"; readonly value: number; readonly position: Position }
  | { readonly type: "identifier"; readonly name: string; readonly position: Position }
  | {
      readonly type: "unary";
      readonly op: string;
      readonly operand: Expr;
      readonly position: Position;
    }
  | { readonly type: "ref"; readonly operand: Expr; readonly position: Position }
  | { readonly type: "deref"; readonly operand: Expr; readonly position: Position }
  | {
      readonly type: "binary";
      readonly op: string;
      readonly left: Expr;
      readonly right: Expr;
      readonly position: Position;
    };

export type Statement =
  | {
      readonly type: "let";
      readonly mutable: boolean;
      readonly name: string;
      readonly value: Expr;
      readonly position: Position;
    }
  | {
      readonly type: "assign";
      readonly name: string;
      readonly value: Expr;
      readonly position: Position;
    }
  | { readonly type: "return"; readonly value: Expr; readonly position: Position };

export interface Program {
  readonly statements: readonly Statement[];
}

const EOF: Token = { kind: "eof", value: "", position: { line: 0, column: 0 } };

function err(kind: EvalError["kind"], message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

export function parse(tokens: readonly Token[]): Result<Program, EvalError> {
  let i = 0;

  const peek = (): Token => tokens[i] ?? EOF;
  const advance = (): Token => {
    const t = peek();
    i++;
    return t;
  };
  const expect = (kind: TokenKind, what: string): Result<Token, EvalError> => {
    const t = peek();
    if (t.kind !== kind) {
      return Err(
        err("syntax", `Expected ${what} but found "${t.value || "end of input"}"`, t.position),
      );
    }
    return Ok(advance());
  };

  const parsePrimary = (): Result<Expr, EvalError> => {
    const t = peek();
    if (t.kind === "number") {
      advance();
      return Ok({ type: "number", value: Number(t.value), position: t.position });
    }
    if (t.kind === "identifier") {
      advance();
      return Ok({ type: "identifier", name: t.value, position: t.position });
    }
    if (t.kind === "lparen") {
      advance();
      return andThen(parseExpr(), (inner) => andThen(expect("rparen", "')'"), () => Ok(inner)));
    }
    return Err(
      err("syntax", `Expected an expression but found "${t.value || "end of input"}"`, t.position),
    );
  };

  const parseUnary = (): Result<Expr, EvalError> => {
    const t = peek();
    if (t.kind === "operator" && t.value === "-") {
      advance();
      return andThen(parseUnary(), (operand) =>
        Ok({ type: "unary", op: "-", operand, position: t.position }),
      );
    }
    if (t.kind === "operator" && t.value === "&") {
      advance();
      return andThen(parseUnary(), (operand) => Ok({ type: "ref", operand, position: t.position }));
    }
    if (t.kind === "operator" && t.value === "*") {
      advance();
      return andThen(parseUnary(), (operand) =>
        Ok({ type: "deref", operand, position: t.position }),
      );
    }
    return parsePrimary();
  };

  const parseMultiplicative = (): Result<Expr, EvalError> => {
    let left = parseUnary();
    while (left.ok) {
      const t = peek();
      if (t.kind === "operator" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        advance();
        const right = parseUnary();
        if (!right.ok) return right;
        left = Ok({
          type: "binary",
          op: t.value,
          left: left.value,
          right: right.value,
          position: left.value.position,
        });
      } else {
        break;
      }
    }
    return left;
  };

  const parseAdditive = (): Result<Expr, EvalError> => {
    let left = parseMultiplicative();
    while (left.ok) {
      const t = peek();
      if (t.kind === "operator" && (t.value === "+" || t.value === "-")) {
        advance();
        const right = parseMultiplicative();
        if (!right.ok) return right;
        left = Ok({
          type: "binary",
          op: t.value,
          left: left.value,
          right: right.value,
          position: left.value.position,
        });
      } else {
        break;
      }
    }
    return left;
  };

  const parseExpr = (): Result<Expr, EvalError> => parseAdditive();

  const parseStatement = (): Result<Statement, EvalError> => {
    const t = peek();
    if (t.kind === "keyword" && t.value === "let") {
      advance();
      let mutable = false;
      if (peek().kind === "keyword" && peek().value === "mut") {
        advance();
        mutable = true;
      }
      return andThen(expect("identifier", "a variable name"), (nameTok) =>
        andThen(expect("operator", "'='"), () =>
          andThen(parseExpr(), (value) =>
            andThen(expect("semicolon", "';'"), () =>
              Ok({ type: "let", mutable, name: nameTok.value, value, position: t.position }),
            ),
          ),
        ),
      );
    }
    if (t.kind === "keyword" && t.value === "return") {
      advance();
      return andThen(parseExpr(), (value) =>
        andThen(expect("semicolon", "';'"), () =>
          Ok({ type: "return", value, position: t.position }),
        ),
      );
    }
    if (t.kind === "identifier") {
      advance();
      return andThen(expect("operator", "'='"), () =>
        andThen(parseExpr(), (value) =>
          andThen(expect("semicolon", "';'"), () =>
            Ok({ type: "assign", name: t.value, value, position: t.position }),
          ),
        ),
      );
    }
    return Err(err("syntax", `Unexpected token "${t.value || "end of input"}"`, t.position));
  };

  const statements: Statement[] = [];
  while (peek().kind !== "eof") {
    const stmt = parseStatement();
    if (!stmt.ok) return Err(stmt.error);
    statements.push(stmt.value);
  }
  return Ok({ statements });
}
