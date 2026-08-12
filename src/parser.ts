import type { Token } from "./tokenizer";
import { COMPOUND_OPS } from "./tokenizer";
import type { AstNode, TypeNode } from "./ast";
import type { IntTypeName } from "./types";

const COMPARISON_OPS = new Set(["<", "<=", ">", ">=", "==", "!="]);

export class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private parseType(): TypeNode {
    // Reference type: &Type
    if (this.peek()?.[0] === "ref" && this.peek()![1] === "&") {
      this.consume(); // "&"
      const innerType = this.parseType();
      return { kind: "ref", innerType };
    }
    // Array type: [Type; N]
    if (this.peek()?.[0] === "group" && this.peek()![1] === "[") {
      this.consume(); // "["
      const elementType = this.parseType();
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
        () => this.parseType(),
        "Expected field name in struct type",
        "Expected : in struct type",
      );
      if (this.peek()?.[0] !== "group" || this.peek()![1] !== "}")
        throw new Error("Expected } in struct type");
      this.consume(); // "}"
      const fields = rawFields.map((f) => ({ name: f.name, type: f.value }));
      return { kind: "struct", fields };
    }
    // Function type: (Type, Type) => ReturnType
    if (this.peek()?.[0] === "group" && this.peek()![1] === "(") {
      this.consume(); // "("
      const params = this.parseParenList(() => this.parseType());
      if (this.peek()?.[0] !== "op" || this.peek()![1] !== "=>")
        throw new Error("Expected => in function type");
      this.consume(); // "=>"
      const returnType = this.parseType();
      return { kind: "fn", params, returnType };
    }
    // Simple type name
    const typeToken = this.peek();
    if (!typeToken || typeToken[0] !== "id")
      throw new Error("Expected type name");
    const typeName = typeToken[1];
    this.consume();
    return { kind: "name", name: typeName };
  }

  private parseDelimitedList<T>(parseItem: () => T, separator: string): T[] {
    const items: T[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== "}") {
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
  ): { name: string; value: T }[] {
    return this.parseDelimitedList(() => {
      const nameToken = this.peek();
      if (!nameToken || nameToken[0] !== "id") throw new Error(nameError);
      const name = nameToken[1];
      this.consume();
      if (this.peek()?.[0] !== "colon") throw new Error(colonError);
      this.consume();
      const value = parseValue();
      return { name, value };
    }, ",");
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

  private parseStatement(): AstNode {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of input");

    if (token[0] === "kw" && token[1] === "let") {
      return this.parseLet();
    }

    // fn name(params) : ReturnType => body;
    if (token[0] === "kw" && token[1] === "fn") {
      return this.parseFnDef();
    }

    if (
      token[0] === "op" &&
      token[1] === "*" &&
      this.pos + 2 < this.tokens.length &&
      this.tokens[this.pos + 2]![0] === "assign"
    ) {
      return this.parseDerefAssign();
    }

    // array[index] = value
    if (
      token[0] === "id" &&
      this.pos + 2 < this.tokens.length &&
      this.tokens[this.pos + 1]?.[0] === "group" &&
      this.tokens[this.pos + 1]?.[1] === "["
    ) {
      return this.parseArrayIndexOrAssign();
    }

    if (
      token[0] === "id" &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1]![0] === "assign" &&
      COMPOUND_OPS[this.tokens[this.pos + 1]![1] as "+=" | "-="]
    ) {
      return this.parseCompoundAssign();
    }

    if (
      token[0] === "id" &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1]![0] === "assign"
    ) {
      return this.parseAssign();
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

    const expr = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return expr;
  }

  private parseArrayIndexOrAssign(): AstNode {
    // Look ahead to check if this is array[index] = value
    let bracketDepth = 0;
    let closeBracketPos = -1;
    for (let i = this.pos; i < this.tokens.length; i++) {
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
    const isAssign =
      closeBracketPos > 0 &&
      closeBracketPos + 1 < this.tokens.length &&
      this.tokens[closeBracketPos + 1]![0] === "assign";

    if (isAssign) {
      const idToken = this.consume();
      const array: AstNode = { type: "id", name: idToken[1] as string };
      const index = this.consumeArrayIndex();
      this.consume(); // "="
      const value = this.parseAddSub();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "array-index-assign", array, index, value };
    }

    // Not an assignment — parse as normal expression (array[0] + ...)
    const expr = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return expr;
  }

  private consumeArrayIndex(): AstNode {
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "[")
      throw new Error("Expected [");
    this.consume(); // "["
    const index = this.parseAddSub();
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== "]")
      throw new Error("Expected ]");
    this.consume(); // "]"
    return index;
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
    if (
      this.peek()?.[0] === "id" &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1]![0] === "assign"
    ) {
      const name = this.consume()[1] as string;
      this.consume(); // "="
      const value = this.parseFactor();
      if (this.peek()?.[0] === "semi") this.consume();
      return { type: "assign", name, value };
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
    // Optional type annotation: : U8, : &(I32, I32) => I32
    let typeAnnotation: string | undefined;
    if (this.peek()?.[0] === "colon") {
      this.consume(); // ":"
      const typeToken = this.peek();
      if (typeToken?.[0] === "id") {
        typeAnnotation = typeToken[1];
        this.consume();
      } else if (typeToken?.[0] === "ref" || typeToken?.[0] === "group") {
        // Complex type like &(I32, I32) => I32 — parse but don't store
        this.parseType();
      } else {
        throw new Error("Expected type name");
      }
    }
    if (this.peek()?.[0] !== "assign") throw new Error("Expected =");
    this.consume();
    const value = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "let", name, mutable: isMut, value, typeAnnotation };
  }

  private parseAssign(): AstNode {
    return this.parseAssignLike("assign");
  }

  private parseCompoundAssign(): AstNode {
    const name = this.consume()[1] as string;
    const opToken = this.consume()[1] as "+=" | "-=";
    const op = opToken[0] as "+" | "-";
    const value = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "compoundassign", name, op, value };
  }

  private parseAssignLike(type: "assign"): AstNode {
    const name = this.consume()[1] as string;
    this.consume(); // operator
    const value = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return { type, name, value };
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
    const range = this.parseRange();
    if (this.peek()?.[0] !== "group" || this.peek()![1] !== ")")
      throw new Error("Expected ) after for loop");
    this.consume(); // ")"
    const body = this.parseBlock();
    return { type: "for-loop", variable, range, body };
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

  private parseDerefAssign(): AstNode {
    this.consume(); // "*"
    const idToken = this.peek();
    if (!idToken || idToken[0] !== "id")
      throw new Error("Expected identifier after *");
    this.consume();
    this.consume(); // "="
    const value = this.parseAddSub();
    const target: AstNode = {
      type: "deref",
      operand: { type: "id", name: idToken[1] },
    };
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "derefassign", target, value };
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
      return { type: "type-check", operand: left, typeNode };
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

    // Parse return type: : Type
    if (this.peek()?.[0] !== "colon")
      throw new Error("Expected : before return type");
    this.consume(); // ":"
    const returnType = this.parseType();

    // Parse => body
    if (this.peek()?.[0] !== "op" || this.peek()![1] !== "=>")
      throw new Error("Expected => before function body");
    this.consume(); // "=>"
    const body = this.parseAddSub();

    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "fn-def", name, params, returnType, body };
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
      return { type: "num", value: token[1], numType: token[2] };
    }

    if (token[0] === "bool") {
      this.consume();
      return { type: "bool", value: token[1] };
    }

    if (token[0] === "str") {
      this.consume();
      return this.parseStringExpr(token[1]);
    }

    if (token[0] === "id") {
      this.consume();
      // Check for function call: name(args)
      if (this.peek()?.[0] === "group" && this.peek()![1] === "(") {
        return this.parseFnCall(token[1]);
      }
      let node: AstNode = { type: "id", name: token[1] };
      // Check for array indexing: array[0]
      while (this.peek()?.[0] === "group" && this.peek()![1] === "[") {
        const index = this.consumeArrayIndex();
        node = { type: "array-index", array: node, index };
      }
      // Check for struct field access: pt.x
      while (this.peek()?.[0] === "op" && this.peek()![1] === ".") {
        this.consume(); // "."
        const fieldToken = this.peek();
        if (!fieldToken || fieldToken[0] !== "id")
          throw new Error("Expected field name after .");
        const field = fieldToken[1];
        this.consume();
        node = { type: "struct-access", struct: node, field };
      }
      return node;
    }

    throw new Error(`Unexpected token: ${token}`);
  }

  private parseStringExpr(str: string): AstNode {
    // Tokenize the string content and parse it
    const strTokens: Token[] = [];
    const re = /([a-zA-Z_][a-zA-Z0-9_]*)|(==|&&|\|\||;)|(\d+\.?\d*)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(str))) {
      const [text] = match;
      if (text === "true") strTokens.push(["bool", true]);
      else if (text === "false") strTokens.push(["bool", false]);
      else if (text === "let") strTokens.push(["kw", "let"]);
      else if (text === "&&" || text === "||" || text === "==")
        strTokens.push(["op", text as "&&" | "||" | "=="]);
      else if (text === ";") strTokens.push(["semi", ";"]);
      else if (/^[a-zA-Z_]/.test(text)) strTokens.push(["id", text]);
      else strTokens.push(["num", Number(text), undefined]);
    }

    // Parse string expression with a mini-parser
    let pos = 0;
    const peek = () => strTokens[pos];
    const consume = () => strTokens[pos++]!;

    const parseOr = (): AstNode => {
      let left = parseAnd();
      while (peek()?.[0] === "op" && peek()![1] === "||") {
        consume();
        const right = parseAnd();
        left = { type: "binop", op: "||", left, right };
      }
      return left;
    };

    const parseAnd = (): AstNode => {
      let left = parseEq();
      while (peek()?.[0] === "op" && peek()![1] === "&&") {
        consume();
        const right = parseEq();
        left = { type: "binop", op: "&&", left, right };
      }
      return left;
    };

    const parseEq = (): AstNode => {
      const left = parsePrimary();
      if (peek()?.[0] === "op" && peek()![1] === "==") {
        consume();
        const right = parsePrimary();
        return { type: "binop", op: "==", left, right };
      }
      return left;
    };

    const parsePrimary = (): AstNode => {
      const token = peek();
      if (!token) throw new Error("Unexpected end of string expression");
      if (token[0] === "num") {
        consume();
        return { type: "num", value: token[1] };
      }
      if (token[0] === "bool") {
        consume();
        return { type: "bool", value: token[1] };
      }
      if (token[0] === "id") {
        consume();
        return { type: "id", name: token[1] };
      }
      throw new Error(`Unexpected token in string expression: ${token}`);
    };

    // Handle semicolon-separated statements
    const statements: AstNode[] = [];
    while (pos < strTokens.length) {
      if (peek()?.[0] === "kw" && peek()![1] === "let") {
        consume(); // "let"
        const idToken = peek();
        if (!idToken || idToken[0] !== "id")
          throw new Error("Expected identifier after let");
        const name = idToken[1];
        consume();
        // Skip "="
        if (peek()?.[0] === "op" && peek()![1] === "=") consume();
        const value = parseOr();
        statements.push({ type: "let", name, mutable: false, value });
        if (peek()?.[0] === "semi") consume();
      } else {
        statements.push(parseOr());
        if (peek()?.[0] === "semi") consume();
      }
    }

    if (statements.length === 1) return statements[0]!;
    return { type: "block", statements };
  }
}
