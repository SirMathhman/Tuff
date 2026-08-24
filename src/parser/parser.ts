import { ErrorKind } from "../errors.ts";
import type { EvalError, Position } from "../errors.ts";
import type { Token, TokenKind } from "../lexer/index.ts";
import { Err, Ok, andThen, map } from "../result.ts";
import type { Result } from "../result.ts";
import { ExprType, StatementType } from "../ast/index.ts";
import type {
  Expr,
  FnParam,
  IdentifierExpr,
  ParsedBlock,
  Program,
  Statement,
} from "../ast/index.ts";

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
    if (t.kind === "keyword" && t.value === "fn") {
      return this.parseFnDecl(t);
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
          : Ok(null as Token | null);
      return andThen(afterName, (annotationTok) =>
        andThen(this.expect("operator", "'='"), () =>
          andThen(this.parseExpr(), (value) =>
            andThen(this.expect("semicolon", "';'"), () =>
              Ok({
                type: StatementType.Let,
                mutable,
                name: nameTok.value,
                annotation: annotationTok ? annotationTok.value : null,
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

  private parseFnDecl(t: Token): Result<Statement, EvalError> {
    this.advance();
    const nameTok = this.expect("identifier", "a function name");
    if (!nameTok.ok) return nameTok;
    const lparen = this.expect("lparen", "'('");
    if (!lparen.ok) return lparen;
    const paramsResult = this.parseFnParams();
    if (!paramsResult.ok) return paramsResult;
    const colon = this.expect("colon", "':'");
    if (!colon.ok) return colon;
    const retTok = this.expect("identifier", "a return type");
    if (!retTok.ok) return retTok;
    const arrow = this.expect("operator", "'=>'");
    if (!arrow.ok) return arrow;
    if (this.peek().kind !== "lbrace") {
      return Err(
        err(
          ErrorKind.Syntax,
          `Expected '{' but found "${this.peek().value || "end of input"}"`,
          this.peek().position,
        ),
      );
    }
    const block = this.parseBlock(this.peek());
    if (!block.ok) return block;
    return Ok({
      type: StatementType.FnDecl,
      name: nameTok.value.value,
      params: paramsResult.value,
      returnType: retTok.value.value,
      body: block.value.statements,
      position: t.position,
    });
  }

  private commaError(sep: Token): Result<never, EvalError> {
    return Err(
      err(
        ErrorKind.Syntax,
        `Expected "," but found "${sep.value || "end of input"}"`,
        sep.position,
      ),
    );
  }

  private parseFnParams(): Result<FnParam[], EvalError> {
    const params: FnParam[] = [];
    if (this.peek().kind === "rparen") {
      this.advance();
      return Ok(params);
    }
    for (;;) {
      const nameTok = this.expect("identifier", "a parameter name");
      if (!nameTok.ok) return nameTok;
      const colon = this.expect("colon", "':'");
      if (!colon.ok) return colon;
      const typeTok = this.expect("identifier", "a parameter type");
      if (!typeTok.ok) return typeTok;
      params.push({ name: nameTok.value.value, type: typeTok.value.value });
      const sep = this.peek();
      if (sep.kind === "rparen") {
        this.advance();
        return Ok(params);
      }
      if (sep.kind !== "comma") {
        return this.commaError(sep);
      }
      this.advance();
    }
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
    const nameTok = this.expect("identifier", "a variable name");
    if (!nameTok.ok) return nameTok;
    const eq = this.expect("operator", "'='");
    if (!eq.ok) return eq;
    const value = this.parseExpr();
    if (!value.ok) return value;
    const semi = this.expect("semicolon", "';'");
    if (!semi.ok) return semi;
    const target: Expr = {
      type: ExprType.Deref,
      operand: {
        type: ExprType.Identifier,
        name: nameTok.value.value,
        position: nameTok.value.position,
      },
      position: t.position,
    };
    return Ok({ type: StatementType.Assign, target, value: value.value, position: t.position });
  }

  private parseExpr(): Result<Expr, EvalError> {
    return this.parseComparison();
  }

  private parseComparison(): Result<Expr, EvalError> {
    return this.parseBinaryLevel(["<"], () => this.parseAdditive());
  }

  private parseAdditive(): Result<Expr, EvalError> {
    return this.parseBinaryLevel(["+", "-"], () => this.parseMultiplicative());
  }

  private parseMultiplicative(): Result<Expr, EvalError> {
    return this.parseBinaryLevel(["*", "/", "%"], () => this.parseUnary());
  }

  private parseBinaryLevel(
    ops: readonly string[],
    lower: () => Result<Expr, EvalError>,
  ): Result<Expr, EvalError> {
    let left = lower();
    while (left.ok) {
      const t = this.peek();
      if (t.kind === "operator" && ops.includes(t.value)) {
        this.advance();
        const right = lower();
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
      } else if (t.kind === "lparen") {
        if (base.value.type !== ExprType.Identifier) {
          return Err(err(ErrorKind.Syntax, "Can only call a function name", t.position));
        }
        const callee = (base.value as IdentifierExpr).name;
        base = this.parseCallArgs(callee, t.position);
      } else {
        break;
      }
    }
    return base;
  }

  private parseCallArgs(callee: string, position: Position): Result<Expr, EvalError> {
    this.advance();
    const args: Expr[] = [];
    if (this.peek().kind === "rparen") {
      this.advance();
      return Ok({ type: ExprType.Call, callee, args, position });
    }
    for (;;) {
      const arg = this.parseExpr();
      if (!arg.ok) return arg;
      args.push(arg.value);
      const sep = this.peek();
      if (sep.kind === "rparen") {
        this.advance();
        return Ok({ type: ExprType.Call, callee, args, position });
      }
      if (sep.kind !== "comma") {
        return this.commaError(sep);
      }
      this.advance();
    }
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
        return this.commaError(sep);
      }
      this.advance();
    }
  }
}

export function parse(tokens: readonly Token[]): Result<Program, EvalError> {
  return new Parser(tokens).parse();
}
