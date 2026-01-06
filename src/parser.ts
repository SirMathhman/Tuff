/* eslint-disable no-restricted-syntax */
import {
  Result,
  InterpretError,
  Token,
  ok,
  err,
  Value,
} from "./types";
import {
  parseStructFields,
  parseStructLiteral,
  parseMemberAccess,
} from "./structs";
import {
  parseFunctionDeclaration as parseFunctionDeclarationHelper,
  ParserLike,
} from "./functions";
import { parseStatement, parseBraced, parseIfExpression } from "./statements";
import { parseCallExternal } from "./calls";

const parserScopes = new WeakMap<Parser, Map<string, Value>[]>();
const parserTypeScopes = new WeakMap<Parser, Map<string, string[]>[]>();

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

  public getScopes(): Map<string, Value>[] {
    const s = parserScopes.get(this);
    if (!s) {
      const arr: Map<string, Value>[] = [];
      parserScopes.set(this, arr);
      // also initialize type scopes for this parser
      parserTypeScopes.set(this, []);
      return arr;
    }
    return s;
  }

  private getTypeScopes(): Map<string, string[]>[] {
    const s = parserTypeScopes.get(this);
    if (!s) {
      const arr: Map<string, string[]>[] = [];
      parserTypeScopes.set(this, arr);
      return arr;
    }
    return s;
  }

  private currentTypeScope(): Map<string, string[]> | undefined {
    const s = this.getTypeScopes();
    const ln = s.length;
    if (ln === 0) return undefined;
    return s[ln - 1];
  }

  private lookupType(name: string): string[] | undefined {
    const s = this.getTypeScopes();
    for (let i = s.length - 1; i >= 0; i--) {
      const scope = s[i];
      if (scope.has(name)) return scope.get(name);
    }
    return undefined;
  }
  private currentScope(): Map<string, Value> | undefined {
    const s = this.getScopes();
    const ln = s.length;
    if (ln === 0) return undefined;
    return s[ln - 1];
  }

  private scopeHas(scope: Map<string, Value>, key: string): boolean {
    return scope.has(key);
  }

  public lookupVar(name: string): Value | undefined {
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

  public pushScope(): void {
    this.getScopes().push(new Map<string, Value>());
    // also push a parallel type scope for struct definitions
    this.getTypeScopes().push(new Map<string, string[]>());
  }

  public popScope(): void {
    this.getScopes().pop();
    this.getTypeScopes().pop();
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
    value: Value
  ): InterpretError | undefined {
    // named primitive types
    if (typeName === "Bool") {
      if (typeof value !== "number" || !(value === 0 || value === 1)) {
        return {
          type: "InvalidInput",
          message: "Type mismatch: expected Bool",
        };
      }
      return undefined;
    }
    if (typeName === "I32") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return { type: "InvalidInput", message: "Type mismatch: expected I32" };
      }
      return undefined;
    }

    // user-defined struct types
    const typeDef = this.lookupType(typeName);
    if (typeDef !== undefined) {
      if (!(value instanceof Map)) {
        return {
          type: "InvalidInput",
          message: `Type mismatch: expected ${typeName}`,
        };
      }
      // check all fields exist and are numeric
      for (const f of typeDef) {
        const v = value.get(f);
        if (typeof v !== "number") {
          return {
            type: "InvalidInput",
            message: `Type mismatch: expected ${typeName}`,
          };
        }
      }
      return undefined;
    }

    return { type: "InvalidInput", message: `Unknown type: ${typeName}` };
  }

  public parseLetDeclaration(): Result<Value, InterpretError> {
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

  public parseStructDeclaration(): Result<Value, InterpretError> {
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

    const top = this.currentScope();
    if (!top)
      return err({ type: "InvalidInput", message: "Invalid block scope" });

    const name = nameTok.value;

    // do not allow duplicate declarations in the same scope
    if (top.has(name)) {
      return err({ type: "InvalidInput", message: "Duplicate declaration" });
    }

    const fieldsR = parseStructFields(this);
    if (!fieldsR.ok) return fieldsR;

    // record type definition in current type scope
    const curr = this.currentTypeScope();
    if (!curr)
      return err({ type: "InvalidInput", message: "Invalid block scope" });
    curr.set(name, fieldsR.value);

    // also create a placeholder in variable scope for the type name
    top.set(name, 0);
    return ok(0);
  }

  public parseFunctionDeclaration(): Result<Value, InterpretError> {
    return parseFunctionDeclarationHelper(this as unknown as ParserLike);
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

  parsePrimary(): Result<Value, InterpretError> {
    const tkR = this.requireToken();
    if (!tkR.ok) return tkR;
    const tk = tkR.value;

    // parentheses
    if (tk.type === "op" && tk.value === "(") {
      return this.parseParenthesized();
    }

    // braces (block/grouping)
    if (tk.type === "op" && tk.value === "{") {
      return parseBraced(this);
    }

    // conditional: if (cond) consequent else alternative
    if (tk.type === "id" && tk.value === "if") {
      return parseIfExpression(this);
    }

    // literals and identifiers
    return this.parseLiteral();
  }

  parseParenthesized(): Result<Value, InterpretError> {
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

  private parseCall(name: string): Result<Value, InterpretError> {
    return parseCallExternal(this as unknown as object, name);
  }

  private parseBooleanIfPresent(): Result<Value, InterpretError> | undefined {
    const tk = this.peek();
    if (
      tk &&
      tk.type === "id" &&
      (tk.value === "true" || tk.value === "false")
    ) {
      this.consume();
      return ok(tk.value === "true" ? 1 : 0);
    }
    return undefined;
  }

  parseLiteral(): Result<Value, InterpretError> {
    const tk = this.peek();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });

    const b = this.parseBooleanIfPresent();
    if (b) return b;

    // numeric literal
    if (tk.type === "num") {
      this.consume();
      return ok(tk.value);
    }

    // identifier-like literals are handled by a helper to reduce complexity
    if (tk.type === "id") {
      return this.parseIdentifierLike();
    }

    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  private parseIdentifierLike(): Result<Value, InterpretError> {
    const tk = this.peek();
    if (!tk || tk.type !== "id")
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });

    const next = this.tokens[this.idx + 1];

    // struct literal: TypeName { ... }
    if (next && next.type === "op" && next.value === "{") {
      const typeDef = this.lookupType(tk.value);
      if (!typeDef)
        return err({
          type: "InvalidInput",
          message: `Unknown type: ${tk.value}`,
        });
      // consume type name
      this.consume();
      return parseStructLiteral(this, typeDef);
    }

    // function call: id(arg1, arg2)
    const maybeCall = this.tokens[this.idx + 1];
    if (maybeCall && maybeCall.type === "op" && maybeCall.value === "(") {
      return this.parseCall(tk.value);
    }

    // member access: var.field
    const maybeDot = this.tokens[this.idx + 1];
    if (maybeDot && maybeDot.type === "op" && maybeDot.value === ".") {
      return parseMemberAccess(this, tk.value);
    }

    // otherwise variable lookup
    const v = this.lookupVar(tk.value);
    if (v !== undefined) {
      this.consume();
      return ok(v);
    }

    return err({ type: "UndefinedIdentifier", identifier: tk.value });
  }

  parseFactor(): Result<Value, InterpretError> {
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
    nextParser: () => Result<Value, InterpretError>,
    ops: Set<string>,
    apply: (op: string, a: number, b: number) => number
  ): Result<Value, InterpretError> {
    const left = nextParser();
    if (!left.ok) return left;

    // if there's no operator following, just return the parsed value as-is
    let p = this.peek();
    if (!p || p.type !== "op" || !ops.has(p.value)) {
      return ok(left.value);
    }

    if (typeof left.value !== "number")
      return err({
        type: "InvalidInput",
        message: "Left operand must be numeric",
      });

    let val = left.value as number;

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
      if (typeof right.value !== "number")
        return err({
          type: "InvalidInput",
          message: "Right operand must be numeric",
        });
      val = apply(op, val, right.value as number);
      p = this.peek();
    }
    return ok(val);
  }

  parseTerm(): Result<Value, InterpretError> {
    return this.parseBinary(
      () => this.parseFactor(),
      new Set(["*", "/"]),
      (op, a, b) => (op === "*" ? a * b : a / b)
    );
  }

  parseExpr(): Result<Value, InterpretError> {
    return this.parseBinary(
      () => this.parseTerm(),
      new Set(["+", "-"]),
      (op, a, b) => (op === "+" ? a + b : a - b)
    );
  }

  parse(): Result<Value, InterpretError> {
    // empty token stream represents an empty or whitespace-only input -> 0
    if (this.tokens.length === 0) return ok(0);

    // top-level scope for program statements (let declarations, expressions)
    this.pushScope();
    let lastVal: Value = 0;

    while (this.idx < this.tokens.length) {
      const p = this.peek();
      if (!p) {
        this.popScope();
        return err({
          type: "InvalidInput",
          message: "Unable to interpret input",
        });
      }

      const stmtR = parseStatement(this, true);
      if (!stmtR.ok) {
        this.popScope();
        return stmtR;
      }
      lastVal = stmtR.value;
    }

    this.popScope();

    if (typeof lastVal === "number" && !Number.isFinite(lastVal))
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    return ok(lastVal);
  }
}

/* eslint-enable no-restricted-syntax */

export { Parser };
