import type { Token } from "./tokenizer";
import { COMPOUND_OPS } from "./tokenizer";
import type { AstNode, LValue, TypeNode, TypeParam } from "./ast";
import type { IntTypeName } from "./types";

const COMPARISON_OPS = new Set(["<", "<=", ">", ">=", "==", "!="]);

export class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private parseType(
    allowFnType: boolean = true,
    allowConstraint: boolean = true,
  ): TypeNode {
    // Reference type: &Type
    if (this.peek()?.[0] === "ref" && this.peek()![1] === "&") {
      this.consume(); // "&"
      const innerType = this.parseType(allowFnType, false);
      return { kind: "ref", innerType };
    }
    // Array type: [Type; N]
    if (this.peek()?.[0] === "group" && this.peek()![1] === "[") {
      this.consume(); // "["
      const elementType = this.parseType(allowFnType);
      if (this.peek()?.[0] !== "semi" || this.peek()![1] !== ";")
        throw new Error("Expected ; in array type");
      this.consume(); // ";"
      const lengthNode = this.parseMulDiv();
      if (this.peek()?.[0] !== "group" || this.peek()![1] !== "]")
        throw new Error("Expected ] in array type");
      this.consume(); // "]"
      return { kind: "array", elementType, length: lengthNode };
    }
    // Struct type: { x : Type, y : Type }
    if (this.peek()?.[0] === "group" && this.peek()![1] === "{") {
      this.consume(); // "{"
      const rawFields = this.parseStructFields(
        () => this.parseType(allowFnType),
        "Expected field name in struct type",
        "Expected : in struct type",
      );
      if (this.peek()?.[0] !== "group" || this.peek()![1] !== "}")
        throw new Error("Expected } in struct type");
      this.consume(); // "}"
      const fields = rawFields.map((f) => ({ name: f.name, type: f.value }));
      return { kind: "struct", fields };
    }
    // Tuple type: (Type, Type) or function type: (Type, Type) => ReturnType
    if (this.peek()?.[0] === "group" && this.peek()![1] === "(") {
      this.consume(); // "("
      const elementTypes = this.parseParenList(() =>
        this.parseType(allowFnType),
      );
      // Check if it's a function type
      if (
        allowFnType &&
        this.peek()?.[0] === "op" &&
        this.peek()![1] === "=>"
      ) {
        this.consume(); // "=>"
        const returnType = this.parseType(allowFnType);
        return { kind: "fn", params: elementTypes, returnType };
      }
      // It's a tuple type
      return { kind: "tuple", elementTypes };
    }
    // Simple type name (may be followed by | for union)
    const typeToken = this.peek();
    if (!typeToken || typeToken[0] !== "id")
      throw new Error("Expected type name");
    const typeName = typeToken[1];
    this.consume();
    const type: TypeNode = { kind: "name", name: typeName };
    // Check for constraint: Type > 0, Type >= 0, Type < 256, Type <= 255, Type == 100, Type != 0
    if (allowConstraint && this.peek()?.[0] === "op") {
      const opToken = this.peek()![1] as string;
      if (["<", "<=", ">", ">=", "==", "!="].includes(opToken)) {
        this.consume();
        const constraintToken = this.peek();
        if (!constraintToken || constraintToken[0] !== "num")
          throw new Error("Expected number in type constraint");
        const constraintValue = constraintToken[1];
        this.consume();
        type.constraint = { op: opToken, value: constraintValue };
      }
    }
    // Check for union: Type | Type
    if (this.peek()?.[0] === "op" && this.peek()![1] === "|") {
      this.consume(); // "|"
      const unionTypes: TypeNode[] = [type];
      unionTypes.push(this.parseType(allowFnType));
      return { kind: "union", types: unionTypes };
    }
    return type;
  }

  private parseList<T>(
    parseItem: () => T,
    open: string,
    close: string,
    separator: string,
  ): T[] {
    const items: T[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== close) {
      items.push(parseItem());
      if (this.peek()?.[0] === "op" && this.peek()![1] === separator) {
        this.consume();
      }
    }
    return items;
  }

  private parseStructFields<T>(
    parseValue: () => T,
    nameError: string,
    colonError: string,
  ): { name: string; mutable: boolean; value: T }[] {
    return this.parseList(
      () => {
        const isMut = this.peek()?.[0] === "kw" && this.peek()![1] === "mut";
        if (isMut) this.consume();
        const nameToken = this.peek();
        if (!nameToken || nameToken[0] !== "id") throw new Error(nameError);
        const name = nameToken[1];
        this.consume();
        if (this.peek()?.[0] !== "colon") throw new Error(colonError);
        this.consume();
        const value = parseValue();
        return { name, mutable: isMut, value };
      },
      "{",
      "}",
      ",",
    );
  }

  parse(): AstNode[] {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length) {
      statements.push(this.parseStatement());
    }
    return statements;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++]!;
  }

  private maybeConsumeSemi(): void {
    if (this.peek()?.[0] === "semi") this.consume();
  }

  private parseTypeAlias(): AstNode {
    this.consume(); // "type"
    const nameToken = this.consume();
    const name = nameToken[1] as string;
    if (this.peek()?.[0] !== "assign" || this.peek()![1] !== "=")
      throw new Error("Expected = in type alias");
    this.consume(); // "="
    const typeNode = this.parseType();
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "type-alias", name, typeNode };
  }

  private parseBraceDef<T>(
    kw: string,
    parseItems: () => T,
  ): { name: string; items: T } {
    this.consume(); // keyword
    const nameToken = this.consume();
    const name = nameToken[1] as string;
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "{")
      throw new Error(`Expected { in ${kw} definition`);
    this.consume(); // "{"
    const items = parseItems();
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "}")
      throw new Error(`Expected } in ${kw} definition`);
    this.consume(); // "}"
    return { name, items };
  }

  private parseStructDef(): AstNode {
    const { name, items } = this.parseBraceDef("struct", () =>
      this.parseStructFields(
        () => this.parseType(),
        "Expected field name in struct",
        "Expected : in struct",
      ),
    );
    const fields = items.map((f) => ({
      name: f.name,
      mutable: f.mutable,
      type: f.value,
    }));
    return { type: "struct-def", name, fields };
  }

  private parseEnumDef(): AstNode {
    const { name, items: variants } = this.parseBraceDef("enum", () =>
      this.parseList(
        () => {
          const variantToken = this.peek();
          if (!variantToken || variantToken[0] !== "id")
            throw new Error("Expected variant name in enum");
          const variant = variantToken[1];
          this.consume();
          return variant;
        },
        "{",
        "}",
        ",",
      ),
    );
    return { type: "enum-def", name, variants };
  }

  private parseMatch(): AstNode {
    this.consume(); // "match"
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "(")
      throw new Error("Expected ( after match");
    this.consume(); // "("
    const target = this.parseAddSub();
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
      throw new Error("Expected ) after match target");
    this.consume(); // ")"
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "{")
      throw new Error("Expected { after match");
    this.consume(); // "{"
    const cases: { pattern: AstNode | null; body: AstNode }[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== "}") {
      if (this.peek()?.[0] === "kw" && this.peek()![1] === "case") {
        this.consume(); // "case"
        // Wildcard pattern: `_`
        const pattern: AstNode | null =
          this.peek()?.[0] === "id" && this.peek()![1] === "_"
            ? (this.consume(), null)
            : this.parseAddSub();
        if (this.peek()?.[0] !== "op" || this.peek()![1] !== "=>")
          throw new Error("Expected => after case pattern");
        this.consume(); // "=>"
        const body = this.parseFactor();
        if (this.peek()?.[0] === "semi") this.consume();
        cases.push({ pattern, body });
      } else {
        throw new Error("Expected case in match");
      }
    }
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "}")
      throw new Error("Expected } after match");
    this.consume(); // "}"
    return { type: "match", target, cases };
  }

  private parseStatement(): AstNode {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of input");

    if (token[0] === "kw" && token[1] === "let") {
      return this.parseLet();
    }

    // type Alias = Type;
    if (token[0] === "kw" && token[1] === "type") {
      return this.parseTypeAlias();
    }

    // struct Name { field : Type, ... }
    if (token[0] === "kw" && token[1] === "struct") {
      return this.parseStructDef();
    }

    // enum Name { Variant1, Variant2, ... }
    if (token[0] === "kw" && token[1] === "enum") {
      return this.parseEnumDef();
    }

    // fn name(params) : ReturnType => body;
    if (token[0] === "kw" && token[1] === "fn") {
      return this.parseFnDef();
    }

    // match (expr) { case PATTERN => body; ... }
    if (token[0] === "kw" && token[1] === "match") {
      return this.parseMatch();
    }

    // Unified LHS assignment: parse an LHS target, then check for = or +=/-=
    const lvalue = this.tryParseLValue();
    if (lvalue !== undefined) {
      // Check for compound assignment
      if (
        this.peek()?.[0] === "assign" &&
        COMPOUND_OPS[this.peek()![1] as "+=" | "-="]
      ) {
        this.pos = lvalue.startPos;
        return this.parseCompoundAssign();
      }
      // Simple assignment
      if (this.peek()?.[0] === "assign") {
        this.consume(); // "="
        const value = this.parseAddSub();
        this.maybeConsumeSemi();
        return { type: "assign", lvalue: lvalue.lvalue, value };
      }
      // Not an assignment — parse as normal expression
      this.pos = lvalue.startPos;
    }

    // Handle if/else at statement level to capture semicolon after else branch
    if (token[0] === "kw" && token[1] === "if") {
      const expr = this.parseIfStatement();
      return expr;
    }

    // Handle while loop
    if (token[0] === "kw" && token[1] === "while") {
      return this.parseWhile();
    }

    // Handle for loop
    if (token[0] === "kw" && token[1] === "for") {
      return this.parseFor();
    }

    // Handle break
    if (token[0] === "kw" && token[1] === "break") {
      this.consume();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "break" };
    }

    // Handle continue
    if (token[0] === "kw" && token[1] === "continue") {
      this.consume();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "continue" };
    }

    // Handle yield
    if (token[0] === "kw" && token[1] === "yield") {
      this.consume();
      const value = this.parseAddSub();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "yield", value };
    }

    // Handle return
    if (token[0] === "kw" && token[1] === "return") {
      this.consume();
      const value = this.parseAddSub();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "return", value };
    }

    const expr = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return expr;
  }

  /**
   * Try to parse an LHS target. Returns { lvalue, startPos } on success,
   * or undefined if the tokens don't form an assignable target.
   * startPos is the position before any consumption, so we can rewind.
   */
  private tryParseLValue(): { lvalue: LValue; startPos: number } | undefined {
    const startPos = this.pos;
    const token = this.peek();
    if (!token) return undefined;

    // *x — deref of a var
    if (token[0] === "op" && token[1] === "*") {
      this.consume(); // "*"
      const inner = this.tryParseLValue();
      if (inner === undefined) {
        this.pos = startPos;
        return undefined;
      }
      return { lvalue: { kind: "deref", ref: inner.lvalue }, startPos };
    }

    // (*ref)[index] — starts with (
    if (token[0] === "group" && token[1] === "(") {
      // Check for (*ref)[index]
      if (
        this.pos + 1 < this.tokens.length &&
        this.tokens[this.pos + 1]?.[0] === "op" &&
        this.tokens[this.pos + 1]?.[1] === "*"
      ) {
        const saved = this.pos;
        this.consume(); // "("
        this.consume(); // "*"
        const idToken = this.peek();
        if (idToken && idToken[0] === "id") {
          this.consume();
          if (this.peek()?.[0] === "group" && this.peek()![1] === ")") {
            this.consume(); // ")"
            let lvalue: LValue = {
              kind: "deref",
              ref: { kind: "var", name: idToken[1] },
            };
            lvalue = this.consumeIndexChains(lvalue);
            return { lvalue, startPos };
          }
        }
        this.pos = saved;
        return undefined;
      }
    }

    // id or id.field or id[index]
    if (token[0] === "id") {
      const name = this.consume()[1] as string;
      let lvalue: LValue = { kind: "var", name };

      lvalue = this.consumeIndexChains(lvalue);
      lvalue = this.consumeFieldChains(lvalue);
      return { lvalue, startPos };
    }

    return undefined;
  }

  private consumeIndexChains(lvalue: LValue): LValue {
    while (this.peek()?.[0] === "group" && this.peek()![1] === "[") {
      this.consume(); // "["
      const index = this.parseAddSub();
      if (this.peek()?.[0] !== "group" || this.peek()![1] !== "]")
        throw new Error("Expected ]");
      this.consume(); // "]"
      lvalue = { kind: "index", array: lvalue, index };
    }
    return lvalue;
  }

  private consumeFieldChains(lvalue: LValue): LValue {
    return this.consumeDotChain(
      lvalue,
      (n, f) => ({ kind: "field", struct: n, field: f }),
      (n, i) => ({ kind: "index", array: n, index: { type: "num", value: i } }),
    );
  }

  private consumeStructAccessChains(node: AstNode): AstNode {
    return this.consumeDotChain(
      node,
      (n, f) => ({ type: "struct-access", struct: n, field: f }),
      (n, i) => ({ type: "tuple-access", tuple: n, index: i }),
    );
  }

  private consumeDotChain<T>(
    acc: T,
    buildField: (acc: T, field: string) => T,
    buildIndex: (acc: T, index: number) => T,
  ): T {
    while (this.peek()?.[0] === "op" && this.peek()![1] === ".") {
      this.consume(); // "."
      const nextToken = this.peek();
      if (!nextToken) throw new Error("Expected field/index after .");
      if (nextToken[0] === "num") {
        const index = nextToken[1];
        this.consume();
        acc = buildIndex(acc, index);
      } else if (nextToken[0] === "id") {
        const field = nextToken[1];
        this.consume();
        acc = buildField(acc, field);
      } else {
        throw new Error("Expected field name or numeric index after .");
      }
    }
    return acc;
  }

  private consumeIdWithArrayIndices(name: string): AstNode {
    const lvalue = this.consumeIndexChains({ kind: "var", name });
    // Convert LValue index chain back to AstNode
    let node: AstNode = { type: "id", name };
    let current = lvalue;
    while (current.kind === "index") {
      node = { type: "array-index", array: node, index: current.index };
      current = current.array;
    }
    return node;
  }

  private findCloseBracketAndCheckAssign(from: number): boolean {
    let bracketDepth = 0;
    let closeBracketPos = -1;
    for (let i = from; i < this.tokens.length; i++) {
      const t = this.tokens[i]!;
      if (t[0] === "group" && t[1] === "[") bracketDepth++;
      if (t[0] === "group" && t[1] === "]") {
        bracketDepth--;
        if (bracketDepth === 0) {
          closeBracketPos = i;
          break;
        }
      }
    }
    // Skip over any chained [index] brackets
    let pos = closeBracketPos;
    while (
      pos + 1 < this.tokens.length &&
      this.tokens[pos + 1]![0] === "group" &&
      this.tokens[pos + 1]![1] === "["
    ) {
      let depth = 0;
      for (let i = pos + 1; i < this.tokens.length; i++) {
        if (this.tokens[i]![0] === "group" && this.tokens[i]![1] === "[")
          depth++;
        if (this.tokens[i]![0] === "group" && this.tokens[i]![1] === "]") {
          depth--;
          if (depth === 0) {
            pos = i;
            break;
          }
        }
      }
    }
    return (
      pos > 0 &&
      pos + 1 < this.tokens.length &&
      this.tokens[pos + 1]![0] === "assign"
    );
  }

  private parseIfStatement(): AstNode {
    this.consume(); // "if"
    const { condition, thenBranch, elseBranch } = this.parseIfCore(
      () => this.parseBranch(),
      false,
    );
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "if-statement", condition, thenBranch, elseBranch };
  }

  private parseIfCore(
    parseBranch: () => AstNode,
    requireElse = false,
  ): { condition: AstNode; thenBranch: AstNode; elseBranch: AstNode } {
    const condition = this.parseParenCondition("if");
    const thenBranch = parseBranch();
    if (this.peek()?.[0] === "kw" && this.peek()![1] === "else") {
      this.consume(); // "else"
      const elseBranch = parseBranch();
      return { condition, thenBranch, elseBranch };
    }
    if (requireElse) throw new Error("Expected else");
    return {
      condition,
      thenBranch,
      elseBranch: { type: "num", value: 0 },
    };
  }

  private parseBranch(): AstNode {
    // Handle assignment: x = value
    const lvalue = this.tryParseLValue();
    if (lvalue !== undefined && this.peek()?.[0] === "assign") {
      this.consume(); // "="
      const value = this.parseFactor();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "assign", lvalue: lvalue.lvalue, value };
    }
    // Handle yield/return
    const token = this.peek();
    if (token?.[0] === "kw" && token[1] === "yield") {
      this.consume();
      const value = this.parseFactor();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "yield", value };
    }
    if (token?.[0] === "kw" && token[1] === "return") {
      this.consume();
      const value = this.parseFactor();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "return", value };
    }
    const result = this.parseFactor();
    if (this.peek()?.[0] === "semi") this.consume();
    return result;
  }

  private parseMutId(errorMsg = "Expected identifier"): {
    name: string;
    isMut: boolean;
  } {
    const isMut = this.peek()?.[0] === "kw" && this.peek()![1] === "mut";
    if (isMut) this.consume();
    const idToken = this.peek();
    if (!idToken || idToken[0] !== "id") throw new Error(errorMsg);
    const name = idToken[1];
    this.consume();
    return { name, isMut };
  }

  private parseLet(): AstNode {
    this.consume(); // "let"
    const { name, isMut } = this.parseMutId();
    // Optional type annotation: : U8, : &(I32, I32) => I32, : I32 | Char
    let typeAnnotation: TypeNode | undefined;
    if (this.peek()?.[0] === "colon") {
      this.consume(); // ":"
      typeAnnotation = this.parseType();
    }
    if (this.peek()?.[0] !== "assign") throw new Error("Expected =");
    this.consume();
    const value = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "let", name, mutable: isMut, value, typeAnnotation };
  }

  private parseAssign(): AstNode {
    const lvalue = this.tryParseLValue()!;
    this.consume(); // "="
    const value = this.parseAddSub();
    this.maybeConsumeSemi();
    return { type: "assign", lvalue: lvalue.lvalue, value };
  }

  private parseCompoundAssign(): AstNode {
    const lvalue = this.tryParseLValue()!;
    const opToken = this.consume()[1] as "+=" | "-=";
    const op = opToken[0] as "+" | "-";
    const value = this.parseAddSub();
    this.maybeConsumeSemi();
    return { type: "compoundassign", lvalue: lvalue.lvalue, op, value };
  }

  private parseWhile(): AstNode {
    this.consume(); // "while"
    const condition = this.parseParenCondition("while");
    const body =
      this.peek()?.[0] === "group" && this.peek()![1] === "{"
        ? this.parseBlock()
        : this.parseStatement();
    return { type: "while-loop", condition, body };
  }

  private parseFor(): AstNode {
    this.consume(); // "for"
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "(")
      throw new Error("Expected ( after for");
    this.consume(); // "("
    const variable = this.consume()[1] as string;
    if (this.peek()?.[0] !== "kw" || this.peek()![1] !== "in")
      throw new Error("Expected 'in' in for loop");
    this.consume(); // "in"
    const iterable = this.parseAddSub();
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
      throw new Error("Expected ) after for loop");
    this.consume(); // ")"
    const body =
      this.peek()?.[0] === "group" && this.peek()![1] === "{"
        ? this.parseBlock()
        : this.parseStatement();
    return { type: "for-loop", variable, iterable, body };
  }

  private parseParenContext(label: string): AstNode {
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "(")
      throw new Error(`Expected ( after ${label}`);
    this.consume(); // "("
    const expr = this.parseAddSub();
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
      throw new Error("Expected ) after condition");
    this.consume(); // ")"
    return expr;
  }

  private parseParenCondition(label: string): AstNode {
    return this.parseParenContext(label);
  }

  private parseBlock(): AstNode {
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "{")
      throw new Error("Expected {");
    this.consume(); // "{"
    const statements: AstNode[] = [];
    while (
      this.peek() &&
      !(this.peek()![0] === "group" && this.peek()![1] === "}")
    ) {
      statements.push(this.parseStatement());
    }
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "}")
      throw new Error("Expected }");
    this.consume(); // "}"
    return { type: "block", statements };
  }

  private parseAddSub(): AstNode {
    let left = this.parseMulDiv();
    while (
      this.peek()?.[0] === "op" &&
      (this.peek()![1] === "+" || this.peek()![1] === "-")
    ) {
      const op = this.consume()[1] as "+" | "-";
      const right = this.parseMulDiv();
      left = { type: "binop", op, left, right };
    }
    // is operator: `expr is Type`
    if (this.peek()?.[0] === "kw" && this.peek()![1] === "is") {
      this.consume(); // "is"
      const typeNode = this.parseType();
      left = { type: "type-check", operand: left, typeNode };
    }
    // logical operators: &&, ||
    while (
      this.peek()?.[0] === "op" &&
      (this.peek()![1] === "&&" || this.peek()![1] === "||")
    ) {
      const op = this.consume()[1] as "&&" | "||";
      const right = this.parseMulDiv();
      // Handle `is` on the right side
      let rightOperand = right;
      if (this.peek()?.[0] === "kw" && this.peek()![1] === "is") {
        this.consume(); // "is"
        const typeNode = this.parseType();
        rightOperand = { type: "type-check", operand: right, typeNode };
      }
      left = { type: "binop", op, left, right: rightOperand };
    }
    return this.parseRangeSuffix(left);
  }

  private parseRangeSuffix(left: AstNode): AstNode {
    if (this.peek()?.[0] === "op" && this.peek()![1] === "..") {
      this.consume(); // ".."
      const right = this.parseMulDiv();
      return { type: "range", start: left, end: right };
    }
    return left;
  }

  private parseRange(): AstNode {
    const left = this.parseAddSub();
    return this.parseRangeSuffix(left);
  }

  private parseMulDiv(): AstNode {
    let left = this.parseComparison();
    while (
      this.peek()?.[0] === "op" &&
      (this.peek()![1] === "*" || this.peek()![1] === "/")
    ) {
      const op = this.consume()[1] as "*" | "/";
      const right = this.parseComparison();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  private parseComparison(): AstNode {
    let left = this.parseFactor();
    while (
      this.peek()?.[0] === "op" &&
      COMPARISON_OPS.has(this.peek()![1] as string)
    ) {
      const op = this.consume()[1] as "<" | "<=" | ">" | ">=" | "==" | "!=";
      const right = this.parseFactor();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  private parseFactor(): AstNode {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of input");

    // &x or &mut x
    if (token[0] === "ref") {
      this.consume();
      const { name, isMut } = this.parseMutId("Expected identifier after &");
      return { type: "ref", name, mutable: isMut };
    }

    // *y — dereference
    if (token[0] === "op" && token[1] === "*") {
      this.consume();
      const operand = this.parseFactor();
      return { type: "deref", operand };
    }

    if (token[0] === "group" && token[1] === "(") {
      this.consume();
      const expr = this.parseAddSub();
      // Check if there's a comma — tuple literal: (3, 4)
      if (this.peek()?.[0] === "op" && this.peek()![1] === ",") {
        const elements: AstNode[] = [expr];
        while (this.peek()?.[0] === "op" && this.peek()![1] === ",") {
          this.consume(); // ","
          elements.push(this.parseAddSub());
        }
        if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
          throw new Error("Expected ) in tuple literal");
        this.consume(); // ")"
        return { type: "tuple-literal", elements };
      }
      if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
        throw new Error("Expected )");
      this.consume();
      // Check for cast: (expr)Type
      const afterCast = this.peek();
      if (
        afterCast?.[0] === "id" &&
        ["u8", "u16"].includes(afterCast[1].toLowerCase())
      ) {
        this.consume();
        return {
          type: "cast",
          expression: expr,
          typeName: afterCast[1].toUpperCase() as IntTypeName,
        };
      }
      return expr;
    }

    if (token[0] === "group" && token[1] === "{") {
      return this.parseBraced();
    }

    // [1, 2, 3] — array literal
    if (token[0] === "group" && token[1] === "[") {
      return this.parseArrayLiteral();
    }

    // if (cond) then else expr
    if (token[0] === "kw" && token[1] === "if") {
      this.consume(); // "if"
      const { condition, thenBranch, elseBranch } = this.parseIfCore(
        () => this.parseFactor(),
        true,
      );
      return { type: "if-expression", condition, thenBranch, elseBranch };
    }

    // -x — unary minus
    if (token[0] === "op" && token[1] === "-") {
      this.consume();
      const operand = this.parseFactor();
      return { type: "unop", op: "-", operand };
    }

    return this.parsePrimary();
  }

  private parseArrayLiteral(): AstNode {
    this.consume(); // "["
    const elements: AstNode[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== "]") {
      elements.push(this.parseAddSub());
      if (this.peek()?.[0] === "op" && this.peek()![1] === ",") {
        this.consume();
      }
    }
    this.consume(); // "]"
    return { type: "array-literal", elements };
  }

  private parseBraced(): AstNode {
    // Consume the opening brace
    this.consume(); // "{"

    // Look ahead: if next token is an id followed by ":", it's a struct
    if (
      this.peek()?.[0] === "id" &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1]?.[0] === "colon"
    ) {
      return this.parseStructLiteralBody();
    }

    // Otherwise it's a block
    return this.parseBlockBody();
  }

  private parseStructLiteralBody(): AstNode {
    const fields = this.parseStructFields(
      () => this.parseAddSub(),
      "Expected field name",
      "Expected : after field name",
    );
    this.consume(); // "}"
    return { type: "struct-literal", fields };
  }

  private parseBlockBody(): AstNode {
    const statements: AstNode[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== "}") {
      statements.push(this.parseStatement());
    }
    this.consume(); // "}"
    return { type: "block", statements };
  }

  private parseParenList<T>(parseItem: () => T): T[] {
    const items: T[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== ")") {
      items.push(parseItem());
      if (this.peek()?.[0] === "op" && this.peek()![1] === ",") {
        this.consume(); // ","
      }
    }
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
      throw new Error("Expected )");
    this.consume(); // ")"
    return items;
  }

  private parseFnDef(): AstNode {
    this.consume(); // "fn"
    const nameToken = this.peek();
    if (!nameToken || nameToken[0] !== "id")
      throw new Error("Expected function name");
    const name = nameToken[1];
    this.consume();

    // Parse optional type parameters: <T, U> or <T : I32>
    const typeParams: TypeParam[] = [];
    if (this.peek()?.[0] === "op" && this.peek()![1] === "<") {
      this.consume(); // "<"
      do {
        const tp = this.peek();
        if (!tp || tp[0] !== "id")
          throw new Error("Expected type parameter name");
        const tpName = tp[1];
        this.consume();
        // Optional constraint: T : I32
        let constraint: TypeNode | undefined;
        if (this.peek()?.[0] === "colon") {
          this.consume(); // ":"
          constraint = this.parseType(false, false);
        }
        typeParams.push({ name: tpName, constraint });
      } while (
        this.peek()?.[0] === "op" &&
        this.peek()![1] === "," &&
        (this.consume() || true)
      );
      if (this.peek()?.[0] !== "op" || this.peek()![1] !== ">")
        throw new Error("Expected > after type parameters");
      this.consume(); // ">"
    }

    // Parse parameters: (name : Type, name : Type)
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "(")
      throw new Error("Expected ( after function name");
    this.consume(); // "("
    const params = this.parseParenList(() => {
      const paramName = this.peek();
      if (!paramName || paramName[0] !== "id")
        throw new Error("Expected parameter name");
      const pName = paramName[1];
      this.consume();
      if (this.peek()?.[0] !== "colon")
        throw new Error("Expected : after parameter name");
      this.consume(); // ":"
      const pType = this.parseType();
      return { name: pName, type: pType };
    });

    // Parse return type: : Type (optional)
    let returnType: TypeNode;
    if (this.peek()?.[0] === "colon") {
      this.consume(); // ":"
      returnType = this.parseType(false);
    } else {
      returnType = { kind: "name", name: "i32" };
    }

    // Parse => body
    if (this.peek()?.[0] !== "op" || this.peek()![1] !== "=>")
      throw new Error("Expected => before function body");
    this.consume(); // "=>"
    const body = this.parseAddSub();

    if (this.peek()?.[0] === "semi") this.consume();
    return {
      type: "fn-def",
      name,
      typeParams: typeParams.length ? typeParams : undefined,
      params,
      returnType,
      body,
    };
  }

  private parseFnCall(name: string): AstNode {
    this.consume(); // "("
    const args = this.parseParenList(() => this.parseAddSub());
    return { type: "fn-call", name, args };
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of input");

    if (token[0] === "num") {
      this.consume();
      return {
        type: "num",
        value: token[1],
        numType: token[2],
        isFloat: token[3],
      };
    }

    if (token[0] === "bool") {
      this.consume();
      return { type: "bool", value: token[1] };
    }

    if (token[0] === "char") {
      this.consume();
      return { type: "char", value: token[1] };
    }

    if (token[0] === "string") {
      this.consume();
      return { type: "string", value: token[1] };
    }

    if (token[0] === "kw" && token[1] === "null") {
      this.consume();
      return { type: "null" };
    }

    if (token[0] === "kw" && token[1] === "match") {
      return this.parseMatch();
    }

    if (token[0] === "kw" && token[1] === "fn") {
      return this.parseFnDef();
    }

    if (token[0] === "id") {
      this.consume();
      // Check for enum access: EnumName::Variant
      if (this.peek()?.[0] === "op" && this.peek()![1] === "::") {
        this.consume(); // "::"
        const variantToken = this.peek();
        if (!variantToken || variantToken[0] !== "id")
          throw new Error("Expected variant name after ::");
        const variant = variantToken[1];
        this.consume();
        return { type: "enum-access", enumName: token[1], variant };
      }
      // Check for function call: name(args)
      if (this.peek()?.[0] === "group" && this.peek()![1] === "(") {
        return this.parseFnCall(token[1]);
      }
      // Check for struct constructor: Name { field : value, ... }
      if (this.peek()?.[0] === "group" && this.peek()![1] === "{") {
        this.consume(); // "{"
        const fields = this.parseStructFields(
          () => this.parseAddSub(),
          "Expected field name",
          "Expected : after field name",
        );
        if (this.peek()?.[0] !== "group" || this.peek()![1] !== "}")
          throw new Error("Expected } in struct literal");
        this.consume(); // "}"
        return { type: "struct-literal", fields };
      }
      let node = this.consumeIdWithArrayIndices(token[1]);
      node = this.consumeStructAccessChains(node);
      return node;
    }

    throw new Error(`Unexpected token: ${token}`);
  }
}
