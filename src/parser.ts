import { Result, InterpretError, Token, ok, err, Value } from "./types";
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
import {
  initScopes,
  getValueScopes,
  getStructTypeScopes,
  getVarTypeScopes,
} from "./scopes";
import { checkTypeConformance } from "./typeConformance";

function requireNumber(
  value: Value,
  message: string
): Result<number, InterpretError> {
  if (typeof value !== "number") {
    return err({ type: "InvalidInput", message });
  }
  return ok(value);
}

class Parser implements ParserLike {
  private tokens: Token[];
  private idx = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
    initScopes(this);
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
    return getValueScopes(this);
  }

  private getTypeScopes(): Map<string, string[]>[] {
    return getStructTypeScopes(this);
  }

  private currentTypeScope(): Map<string, string[]> | undefined {
    const s = this.getTypeScopes();
    const ln = s.length;
    if (ln === 0) return undefined;
    return s[ln - 1];
  }

  private getVarTypeScopes(): Map<string, string | undefined>[] {
    return getVarTypeScopes(this);
  }

  private currentVarTypeScope(): Map<string, string | undefined> | undefined {
    const s = this.getVarTypeScopes();
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
    const scopes = this.getScopes();
    scopes.push(new Map<string, Value>());
    const typeScopes = this.getTypeScopes();
    typeScopes.push(new Map<string, string[]>());
    const varTypes = this.getVarTypeScopes();
    varTypes.push(new Map<string, string | undefined>());
  }

  public popScope(): void {
    const scopes = this.getScopes();
    scopes.pop();
    const typeScopes = this.getTypeScopes();
    typeScopes.pop();
    const varTypes = this.getVarTypeScopes();
    varTypes.pop();
  }

  private isOpToken(tk: Token | undefined, v: string): boolean {
    return Boolean(tk && tk.type === "op" && tk.value === v);
  }

  private isIdToken(
    tk: Token | undefined
  ): tk is { type: "id"; value: string } {
    return Boolean(tk && tk.type === "id");
  }

  // peek the token after the current
  public peekNext(): Token | undefined {
    const t = this.tokens;
    const nextIdx = this.idx + 1;
    return t[nextIdx];
  }

  // assign to an existing variable in the nearest scope
  public assignVar(name: string, value: Value): Result<Value, InterpretError> {
    const s = this.getScopes();
    for (let i = s.length - 1; i >= 0; i--) {
      const scope = s[i];
      if (this.scopeHas(scope, name)) {
        // check type conformance if declared
        const vScopes = this.getVarTypeScopes();
        let j = vScopes.length - 1;
        let foundType = false;
        while (!foundType && j >= 0) {
          const vs = vScopes[j];
          if (vs.has(name)) {
            const typeName = vs.get(name);
            if (typeName) {
              const tcErr = checkTypeConformance(typeName, value, (n) =>
                this.lookupType(n)
              );
              if (tcErr) return err(tcErr);
            }
            foundType = true;
          }
          j--;
        }
        scope.set(name, value);
        return ok(value);
      }
    }
    return err({ type: "UndefinedIdentifier", identifier: name });
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

  private consumeLetName(): Result<string, InterpretError> {
    const nameTok = this.consume();
    if (!nameTok || nameTok.type !== "id") {
      return err({
        type: "InvalidInput",
        message: "Expected identifier after let",
      });
    }
    return ok(nameTok.value);
  }

  private parseLetInitializerOrDefault(
    typeName: string | undefined
  ): Result<Value, InterpretError> {
    const next = this.peek();
    const declSemiMessage = "Missing ; after variable declaration";

    if (next && next.type === "op" && next.value === "=") {
      this.consume();
      const valR = this.parseExpr();
      if (!valR.ok) return valR;
      const initialValue = valR.value;
      if (typeName) {
        const tcErr = checkTypeConformance(typeName, initialValue, (n) =>
          this.lookupType(n)
        );
        if (tcErr) return err(tcErr);
      }
      const semiErr = this.consumeExpectedOp(";", declSemiMessage);
      if (semiErr) return err(semiErr);
      return ok(initialValue);
    }

    const semiErr = this.consumeExpectedOp(";", declSemiMessage);
    if (semiErr) return err(semiErr);
    return ok(0);
  }

  public parseLetDeclaration(): Result<Value, InterpretError> {
    // assume current token is 'let'
    this.consume();
    const nameR = this.consumeLetName();
    if (!nameR.ok) return nameR;
    const name = nameR.value;

    const typeRes = this.consumeOptionalType();
    if (typeRes.error) return err(typeRes.error);
    const typeName = typeRes.typeName;

    const initialValueR = this.parseLetInitializerOrDefault(typeName);
    if (!initialValueR.ok) return initialValueR;
    const initialValue = initialValueR.value;

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

    top.set(name, initialValue);
    // record declared type (if any) in var type scope so future assignments can be checked
    const vscope = this.currentVarTypeScope();
    if (vscope) vscope.set(name, typeName);

    return ok(initialValue);
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
    return parseFunctionDeclarationHelper(this);
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
    return parseCallExternal(this, name);
  }

  public createChildParser(tokens: Token[]): Parser {
    return new Parser(tokens);
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
    if (!tk || tk.type !== "id") {
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    }
    const next = this.peekNext();

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
    const maybeCall = next;
    if (maybeCall && maybeCall.type === "op" && maybeCall.value === "(") {
      return this.parseCall(tk.value);
    }

    // member access: var.field
    const maybeDot = next;
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

    const leftNumR = requireNumber(left.value, "Left operand must be numeric");
    if (!leftNumR.ok) return leftNumR;
    let val = leftNumR.value;

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
      const rightNumR = requireNumber(
        right.value,
        "Right operand must be numeric"
      );
      if (!rightNumR.ok) return rightNumR;
      val = apply(op, val, rightNumR.value);
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
    const tokens = this.tokens;
    const tokenCount = tokens.length;
    if (tokenCount === 0) return ok(0);

    // top-level scope for program statements (let declarations, expressions)
    this.pushScope();
    let lastVal: Value = 0;

    while (this.idx < tokenCount) {
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

export { Parser };
