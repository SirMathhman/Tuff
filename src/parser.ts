import { ErrorKind } from "./errors.ts";
import type { EvalError, Position } from "./errors.ts";
import type { Token, TokenKind } from "./lexer.ts";
import { Err, Ok, andThen, map } from "./result.ts";
import type { Result } from "./result.ts";

export enum ExprType {
  // test
  Number = "number",
  Boolean = "boolean",
  Identifier = "identifier",
  Unary = "unary",
  Ref = "ref",
  Deref = "deref",
  Binary = "binary",
  Array = "array",
  Index = "index",
}

export interface NumberExpr {
  readonly type: ExprType.Number;
  readonly value: number;
  readonly suffix?: string;
  readonly position: Position;
}

export interface BooleanExpr {
  readonly type: ExprType.Boolean;
  readonly value: boolean;
  readonly position: Position;
}

export interface IdentifierExpr {
  readonly type: ExprType.Identifier;
  readonly name: string;
  readonly position: Position;
}

export interface UnaryExpr {
  readonly type: ExprType.Unary;
  readonly op: string;
  readonly operand: Expr;
  readonly position: Position;
}

export interface RefExpr {
  readonly type: ExprType.Ref;
  readonly mutable: boolean;
  readonly operand: Expr;
  readonly position: Position;
}

export interface DerefExpr {
  readonly type: ExprType.Deref;
  readonly operand: Expr;
  readonly position: Position;
}

export interface BinaryExpr {
  readonly type: ExprType.Binary;
  readonly op: string;
  readonly left: Expr;
  readonly right: Expr;
  readonly position: Position;
}

export interface ArrayExpr {
  readonly type: ExprType.Array;
  readonly elements: readonly Expr[];
  readonly position: Position;
}

export interface IndexExpr {
  readonly type: ExprType.Index;
  readonly array: Expr;
  readonly index: Expr;
  readonly position: Position;
}

export type Expr =
  | NumberExpr
  | BooleanExpr
  | IdentifierExpr
  | UnaryExpr
  | RefExpr
  | DerefExpr
  | BinaryExpr
  | ArrayExpr
  | IndexExpr;

export enum StatementType {
  Let = "let",
  Assign = "assign",
  Return = "return",
  Block = "block",
  If = "if",
  While = "while",
}

export interface LetStmt {
  readonly type: StatementType.Let;
  readonly mutable: boolean;
  readonly name: string;
  readonly value: Expr;
  readonly position: Position;
}

export interface AssignStmt {
  readonly type: StatementType.Assign;
  readonly target: Expr;
  readonly value: Expr;
  readonly position: Position;
}

export interface ReturnStmt {
  readonly type: StatementType.Return;
  readonly value: Expr;
  readonly position: Position;
}

export interface BlockStmt {
  readonly type: StatementType.Block;
  readonly statements: readonly Statement[];
  readonly position: Position;
}

export interface IfStmt {
  readonly type: StatementType.If;
  readonly condition: Expr;
  readonly then: readonly Statement[];
  readonly else: readonly Statement[] | null;
  readonly position: Position;
}

export interface WhileStmt {
  readonly type: StatementType.While;
  readonly condition: Expr;
  readonly body: readonly Statement[];
  readonly position: Position;
}

export type Statement = LetStmt | AssignStmt | ReturnStmt | BlockStmt | IfStmt | WhileStmt;

export interface ParsedBlock {
  readonly statements: Statement[];
  readonly position: Position;
}

export interface Program {
  readonly statements: readonly Statement[];
}

const EOF: Token = { kind: "eof", value: "", position: { line: 0, column: 0 } };

function err(kind: ErrorKind, message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(): Token {
    return this.tokens[this.i] ?? EOF;
  }

  private advance(): Token {
    const t = this.peek();
    this.i++;
    return t;
  }

  private expect(kind: TokenKind, what: string): Result<Token, EvalError> {
    const t = this.peek();
    if (t.kind !== kind) {
      return Err(
        err(
          ErrorKind.Syntax,
          `Expected ${what} but found "${t.value || "end of input"}"`,
          t.position,
        ),
      );
    }
    return Ok(this.advance());
  }

  parse(): Result<Program, EvalError> {
    const statements: Statement[] = [];
    while (this.peek().kind !== "eof") {
      const stmt = this.parseStatement();
      if (!stmt.ok) return Err(stmt.error);
      statements.push(stmt.value);
    }
    return Ok({ statements });
  }

  private parseStatement(): Result<Statement, EvalError> {
    const t = this.peek();
    if (t.kind === "keyword" && t.value === "let") {
      return this.parseLet(t);
    }
    if (t.kind === "keyword" && t.value === "return") {
      return this.parseReturn(t);
    }
    if (t.kind === "keyword" && t.value === "if") {
      return this.parseIf(t);
    }
    if (t.kind === "keyword" && t.value === "while") {
      return this.parseWhile(t);
    }
    if (t.kind === "identifier") {
      return this.parseAssign(t);
    }
    if (t.kind === "operator" && t.value === "*") {
      return this.parseDerefAssign(t);
    }
    if (t.kind === "lbrace") {
      return map(this.parseBlock(t), (block) => ({
        type: StatementType.Block,
        statements: block.statements,
        position: block.position,
      }));
    }
    return Err(
      err(ErrorKind.Syntax, `Unexpected token "${t.value || "end of input"}"`, t.position),
    );
  }

  private parseBlock(t: Token): Result<ParsedBlock, EvalError> {
    this.advance();
    const statements: Statement[] = [];
    while (this.peek().kind !== "rbrace" && this.peek().kind !== "eof") {
      const stmt = this.parseStatement();
      if (!stmt.ok) return stmt;
      statements.push(stmt.value);
    }
    return map(this.expect("rbrace", "'}'"), () => ({ statements, position: t.position }));
  }

  private parseIf(t: Token): Result<Statement, EvalError> {
    this.advance();
    return andThen(this.expect("lparen", "'('"), () =>
      andThen(this.parseExpr(), (condition) =>
        andThen(this.expect("rparen", "')'"), () =>
          andThen(this.parseIfBody(), (then) =>
            andThen(this.parseElse(), (elseBranch) =>
              Ok({
                type: StatementType.If,
                condition,
                then,
                else: elseBranch,
                position: t.position,
              }),
            ),
          ),
        ),
      ),
    );
  }

  private parseWhile(t: Token): Result<Statement, EvalError> {
    this.advance();
    return andThen(this.expect("lparen", "'('"), () =>
      andThen(this.parseExpr(), (condition) =>
        andThen(this.expect("rparen", "')'"), () =>
          andThen(this.parseIfBody(), (body) =>
            Ok({ type: StatementType.While, condition, body, position: t.position }),
          ),
        ),
      ),
    );
  }

  private parseIfBody(): Result<readonly Statement[], EvalError> {
    if (this.peek().kind === "lbrace") {
      return map(this.parseBlock(this.peek()), (block) => block.statements);
    }
    return map(this.parseStatement(), (stmt) => [stmt]);
  }

  private parseElse(): Result<readonly Statement[] | null, EvalError> {
    if (this.peek().kind === "keyword" && this.peek().value === "else") {
      this.advance();
      return this.parseIfBody();
    }
    return Ok(null);
  }

  private parseLet(t: Token): Result<Statement, EvalError> {
    this.advance();
    let mutable = false;
    if (this.peek().kind === "keyword" && this.peek().value === "mut") {
      this.advance();
      mutable = true;
    }
    return andThen(this.expect("identifier", "a variable name"), (nameTok) => {
      const afterName =
        this.peek().kind === "colon"
          ? andThen(Ok(this.advance()), () => this.expect("identifier", "a type name"))
          : Ok(this.peek());
      return andThen(afterName, () =>
        andThen(this.expect("operator", "'='"), () =>
          andThen(this.parseExpr(), (value) =>
            andThen(this.expect("semicolon", "';'"), () =>
              Ok({
                type: StatementType.Let,
                mutable,
                name: nameTok.value,
                value,
                position: t.position,
              }),
            ),
          ),
        ),
      );
    });
  }

  private parseReturn(t: Token): Result<Statement, EvalError> {
    this.advance();
    return andThen(this.parseExpr(), (value) =>
      andThen(this.expect("semicolon", "';'"), () =>
        Ok({ type: StatementType.Return, value, position: t.position }),
      ),
    );
  }

  private parseAssign(t: Token): Result<Statement, EvalError> {
    this.advance();
    const target: Expr = { type: ExprType.Identifier, name: t.value, position: t.position };
    const opTok = this.peek();
    if (opTok.kind !== "operator" || (opTok.value !== "=" && opTok.value !== "+=")) {
      return Err(
        err(
          ErrorKind.Syntax,
          `Expected "=" but found "${opTok.value || "end of input"}"`,
          opTok.position,
        ),
      );
    }
    this.advance();
    const isCompound = opTok.value === "+=";
    return andThen(this.parseExpr(), (rhs) =>
      andThen(this.expect("semicolon", "';'"), () => {
        const value: Expr = isCompound
          ? { type: ExprType.Binary, op: "+", left: target, right: rhs, position: t.position }
          : rhs;
        return Ok({ type: StatementType.Assign, target, value, position: t.position });
      }),
    );
  }

  private parseDerefAssign(t: Token): Result<Statement, EvalError> {
    this.advance();
    return andThen(this.expect("identifier", "a variable name"), (nameTok) =>
      andThen(this.expect("operator", "'='"), () =>
        andThen(this.parseExpr(), (value) =>
          andThen(this.expect("semicolon", "';'"), () =>
            Ok({
              type: StatementType.Assign,
              target: {
                type: ExprType.Deref,
                operand: {
                  type: ExprType.Identifier,
                  name: nameTok.value,
                  position: nameTok.position,
                },
                position: t.position,
              },
              value,
              position: t.position,
            }),
          ),
        ),
      ),
    );
  }

  private parseExpr(): Result<Expr, EvalError> {
    return this.parseComparison();
  }

  private parseComparison(): Result<Expr, EvalError> {
    let left = this.parseAdditive();
    while (left.ok) {
      const t = this.peek();
      if (t.kind === "operator" && t.value === "<") {
        this.advance();
        const right = this.parseAdditive();
        if (!right.ok) return right;
        left = Ok({
          type: ExprType.Binary,
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
  }

  private parseAdditive(): Result<Expr, EvalError> {
    let left = this.parseMultiplicative();
    while (left.ok) {
      const t = this.peek();
      if (t.kind === "operator" && (t.value === "+" || t.value === "-")) {
        this.advance();
        const right = this.parseMultiplicative();
        if (!right.ok) return right;
        left = Ok({
          type: ExprType.Binary,
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
  }

  private parseMultiplicative(): Result<Expr, EvalError> {
    let left = this.parseUnary();
    while (left.ok) {
      const t = this.peek();
      if (t.kind === "operator" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        this.advance();
        const right = this.parseUnary();
        if (!right.ok) return right;
        left = Ok({
          type: ExprType.Binary,
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
  }

  private parseUnary(): Result<Expr, EvalError> {
    const t = this.peek();
    if (t.kind === "operator" && t.value === "-") {
      this.advance();
      return andThen(this.parseUnary(), (operand) =>
        Ok({ type: ExprType.Unary, op: "-", operand, position: t.position }),
      );
    }
    if (t.kind === "operator" && t.value === "&") {
      this.advance();
      let mutable = false;
      if (this.peek().kind === "keyword" && this.peek().value === "mut") {
        this.advance();
        mutable = true;
      }
      return andThen(this.parseUnary(), (operand) =>
        Ok({ type: ExprType.Ref, mutable, operand, position: t.position }),
      );
    }
    if (t.kind === "operator" && t.value === "*") {
      this.advance();
      return andThen(this.parseUnary(), (operand) =>
        Ok({ type: ExprType.Deref, operand, position: t.position }),
      );
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Result<Expr, EvalError> {
    let base = this.parsePrimary();
    while (base.ok) {
      const t = this.peek();
      if (t.kind === "lbracket") {
        this.advance();
        const index = this.parseExpr();
        if (!index.ok) return index;
        const close = this.expect("rbracket", "']'");
        if (!close.ok) return close;
        base = Ok({
          type: ExprType.Index,
          array: base.value,
          index: index.value,
          position: t.position,
        });
      } else {
        break;
      }
    }
    return base;
  }

  private parsePrimary(): Result<Expr, EvalError> {
    const t = this.peek();
    if (t.kind === "number") {
      this.advance();
      const suffixMatch = t.value.match(/[UI](8|16|32|64|Size)$/);
      const suffix = suffixMatch ? suffixMatch[0] : undefined;
      const digits = suffix ? t.value.slice(0, -suffix.length) : t.value;
      if (digits.includes(".")) {
        return Err(
          err(ErrorKind.Syntax, "Fractional number literals are not supported", t.position),
        );
      }
      return Ok({ type: ExprType.Number, value: Number(digits), suffix, position: t.position });
    }
    if (t.kind === "keyword" && (t.value === "true" || t.value === "false")) {
      this.advance();
      return Ok({ type: ExprType.Boolean, value: t.value === "true", position: t.position });
    }
    if (t.kind === "identifier") {
      this.advance();
      return Ok({ type: ExprType.Identifier, name: t.value, position: t.position });
    }
    if (t.kind === "lparen") {
      this.advance();
      return andThen(this.parseExpr(), (inner) =>
        andThen(this.expect("rparen", "')'"), () => Ok(inner)),
      );
    }
    if (t.kind === "lbracket") {
      this.advance();
      return this.parseArrayLiteral(t);
    }
    return Err(
      err(
        ErrorKind.Syntax,
        `Expected an expression but found "${t.value || "end of input"}"`,
        t.position,
      ),
    );
  }

  private parseArrayLiteral(t: Token): Result<Expr, EvalError> {
    const elements: Expr[] = [];
    for (;;) {
      if (this.peek().kind === "rbracket") {
        this.advance();
        return Ok({ type: ExprType.Array, elements, position: t.position });
      }
      const el = this.parseExpr();
      if (!el.ok) return el;
      elements.push(el.value);
      const sep = this.peek();
      if (sep.kind === "rbracket") continue;
      if (sep.kind !== "comma") {
        return Err(
          err(
            ErrorKind.Syntax,
            `Expected "," but found "${sep.value || "end of input"}"`,
            sep.position,
          ),
        );
      }
      this.advance();
    }
  }
}

export function parse(tokens: readonly Token[]): Result<Program, EvalError> {
  return new Parser(tokens).parse();
}
