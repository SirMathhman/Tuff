/* eslint-disable no-restricted-syntax */
import { Result, InterpretError, Token, ok, err } from "./types";

const parserScopes = new WeakMap<Parser, Map<string, number>[]>();

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

  private getScopes(): Map<string, number>[] {
    const s = parserScopes.get(this);
    if (!s) {
      const arr: Map<string, number>[] = [];
      parserScopes.set(this, arr);
      return arr;
    }
    return s;
  }

  private currentScope(): Map<string, number> | undefined {
    const s = this.getScopes();
    const ln = s.length;
    if (ln === 0) return undefined;
    return s[ln - 1];
  }

  private scopeHas(scope: Map<string, number>, key: string): boolean {
    return scope.has(key);
  }

  private lookupVar(name: string): number | undefined {
    const s = this.getScopes();
    const ln = s.length;
    for (let i = ln - 1; i >= 0; i--) {
      const scope = s[i];
      if (this.scopeHas(scope, name)) {
        return scope.get(name);
      }
    }
    return undefined;
  }

  private pushScope(): void {
    this.getScopes().push(new Map<string, number>());
  }

  private popScope(): void {
    this.getScopes().pop();
  }

  private isOpToken(tk: Token | undefined, v: string): boolean {
    return Boolean(tk && tk.type === "op" && tk.value === v);
  }

  private isIdToken(
    tk: Token | undefined
  ): tk is { type: "id"; value: string } {
    return Boolean(tk && tk.type === "id");
  }

  private consumeOptionalType(): { typeName?: string; error?: InterpretError } {
    const maybeColon = this.peek();
    if (this.isOpToken(maybeColon, ":")) {
      this.consume();
      const typeTok = this.consume();
      if (!this.isIdToken(typeTok)) {
        return {
          error: {
            type: "InvalidInput",
            message: "Expected type name after :",
          },
        };
      }
      return { typeName: typeTok.value };
    }
    return {};
  }

  private consumeExpectedOp(
    value: string,
    message: string
  ): InterpretError | undefined {
    const tk = this.consume();
    if (!tk || tk.type !== "op" || tk.value !== value) {
      return { type: "InvalidInput", message };
    }
    return undefined;
  }

  private checkTypeConformance(
    typeName: string,
    value: number
  ): InterpretError | undefined {
    if (typeName === "Bool") {
      if (!(value === 0 || value === 1)) {
        return {
          type: "InvalidInput",
          message: "Type mismatch: expected Bool",
        };
      }
      return undefined;
    }
    if (typeName === "I32") {
      if (!Number.isInteger(value)) {
        return { type: "InvalidInput", message: "Type mismatch: expected I32" };
      }
      return undefined;
    }
    return { type: "InvalidInput", message: `Unknown type: ${typeName}` };
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

    const typeRes = this.consumeOptionalType();
    if (typeRes.error) return err(typeRes.error);
    const typeName = typeRes.typeName;

    const eqErr = this.consumeExpectedOp(
      "=",
      "Expected = in variable declaration"
    );
    if (eqErr) return err(eqErr);

    const valR = this.parseExpr();
    if (!valR.ok) return valR;

    // simple type checks for named types
    if (typeName) {
      const tcErr = this.checkTypeConformance(typeName, valR.value);
      if (tcErr) return err(tcErr);
    }

    const semiErr = this.consumeExpectedOp(
      ";",
      "Missing ; after variable declaration"
    );
    if (semiErr) return err(semiErr);

    const top = this.currentScope();
    if (!top)
      return err({ type: "InvalidInput", message: "Invalid block scope" });

    // do not allow duplicate declarations in the same scope
    if (top.has(name)) {
      return err({
        type: "InvalidInput",
        message: "Duplicate variable declaration",
      });
    }

    top.set(name, valR.value);
    return ok(valR.value);
  }

  private parseStructDeclaration(): Result<number, InterpretError> {
    // assume current token is 'struct'
    this.consume();
    const nameTok = this.consume();
    if (!nameTok || nameTok.type !== "id") {
      return err({
        type: "InvalidInput",
        message: "Expected identifier after struct",
      });
    }
    const open = this.consume();
    if (!open || open.type !== "op" || open.value !== "{") {
      return err({
        type: "InvalidInput",
        message: "Expected { after struct name",
      });
    }
    // consume until matching closing brace (supports nested braces)
    let depth = 1;
    while (true) {
      const p = this.consume();
      if (!p) {
        return err({ type: "InvalidInput", message: "Missing closing brace" });
      }
      if (p.type === "op") {
        if (p.value === "{") depth++;
        else if (p.value === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
    }
    return ok(0);
  }

  private requireToken(): Result<Token, InterpretError> {
    const tk = this.peek();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    return ok(tk);
  }

  parsePrimary(): Result<number, InterpretError> {
    const tkR = this.requireToken();
    if (!tkR.ok) return tkR;
    const tk = tkR.value;

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

  private parseStatement(allowEof: boolean): Result<number, InterpretError> {
    const p = this.peek();
    if (!p)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });

    if (this.isIdToken(p) && p.value === "struct") {
      const sR = this.parseStructDeclaration();
      if (!sR.ok) return sR;
      return ok(sR.value);
    }

    if (this.isIdToken(p) && p.value === "let") {
      const declR = this.parseLetDeclaration();
      if (!declR.ok) return declR;
      return ok(declR.value);
    }

    const exprR = this.parseExpr();
    if (!exprR.ok) return exprR;
    const val = exprR.value;

    const next = this.peek();
    if (this.isOpToken(next, ";")) {
      this.consume();
      return ok(val);
    }

    if (this.isOpToken(next, "}")) {
      return ok(val);
    }

    if (!next && allowEof) {
      return ok(val);
    }

    return err({
      type: "InvalidInput",
      message: "Unexpected token in statement",
    });
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

      const stmtR = this.parseStatement(false);
      if (!stmtR.ok) {
        this.popScope();
        return stmtR;
      }
      lastVal = stmtR.value;
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

  private parseBinary(
    nextParser: () => Result<number, InterpretError>,
    ops: Set<string>,
    apply: (op: string, a: number, b: number) => number
  ): Result<number, InterpretError> {
    const left = nextParser();
    if (!left.ok) return left;
    let val = left.value;
    let p = this.peek();
    while (p && p.type === "op" && ops.has(p.value)) {
      const opToken = this.consume();
      if (!opToken)
        return err({
          type: "InvalidInput",
          message: "Unable to interpret input",
        });
      const op = String(opToken.value);
      const right = nextParser();
      if (!right.ok) return right;
      val = apply(op, val, right.value);
      p = this.peek();
    }
    return ok(val);
  }

  parseTerm(): Result<number, InterpretError> {
    return this.parseBinary(
      () => this.parseFactor(),
      new Set(["*", "/"]),
      (op, a, b) => (op === "*" ? a * b : a / b)
    );
  }

  parseExpr(): Result<number, InterpretError> {
    return this.parseBinary(
      () => this.parseTerm(),
      new Set(["+", "-"]),
      (op, a, b) => (op === "+" ? a + b : a - b)
    );
  }

  parse(): Result<number, InterpretError> {
    // empty token stream represents an empty or whitespace-only input -> 0
    if (this.tokens.length === 0) return ok(0);

    // top-level scope for program statements (let declarations, expressions)
    this.pushScope();
    let lastVal = 0;

    while (this.idx < this.tokens.length) {
      const p = this.peek();
      if (!p) {
        this.popScope();
        return err({
          type: "InvalidInput",
          message: "Unable to interpret input",
        });
      }

      const stmtR = this.parseStatement(true);
      if (!stmtR.ok) {
        this.popScope();
        return stmtR;
      }
      lastVal = stmtR.value;
    }

    this.popScope();

    if (!Number.isFinite(lastVal))
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    return ok(lastVal);
  }
}

/* eslint-enable no-restricted-syntax */

export { Parser };
