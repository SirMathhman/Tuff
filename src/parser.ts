import type { Token } from "./tokenizer";
import { COMPOUND_OPS } from "./tokenizer";
import type { AstNode } from "./ast";

const COMPARISON_OPS = new Set(["<", "<=", ">", ">=", "==", "!="]);

export class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

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

    if (
      token[0] === "op" &&
      token[1] === "*" &&
      this.pos + 2 < this.tokens.length &&
      this.tokens[this.pos + 2]![0] === "assign"
    ) {
      return this.parseDerefAssign();
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
    if (this.peek()?.[0] !== "assign") throw new Error("Expected =");
    this.consume();
    const value = this.parseAddSub();
    if (this.peek()?.[0] === "semi") this.consume();
    return { type: "let", name, mutable: isMut, value };
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
      return expr;
    }

    if (token[0] === "group" && token[1] === "{") {
      // Distinguish struct literal ({ x : 3, y : 4 }) from block ({ let x = 1; x })
      // Look ahead: if next token is an id followed by ":", it's a struct
      if (
        this.pos + 2 < this.tokens.length &&
        this.tokens[this.pos + 1]?.[0] === "id" &&
        this.tokens[this.pos + 2]?.[0] === "colon"
      ) {
        return this.parseStructLiteral();
      }
      return this.parseBlock();
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

  private parseStructLiteral(): AstNode {
    this.consume(); // "{"
    const fields: { name: string; value: AstNode }[] = [];
    while (this.peek()?.[0] !== "group" || this.peek()![1] !== "}") {
      const nameToken = this.peek();
      if (!nameToken || nameToken[0] !== "id")
        throw new Error("Expected field name");
      const name = nameToken[1];
      this.consume();
      if (this.peek()?.[0] !== "colon")
        throw new Error("Expected : after field name");
      this.consume(); // ":"
      const value = this.parseAddSub();
      fields.push({ name, value });
      if (this.peek()?.[0] === "op" && this.peek()![1] === ",") {
        this.consume();
      }
    }
    this.consume(); // "}"
    return { type: "struct-literal", fields };
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of input");

    if (token[0] === "num") {
      this.consume();
      return { type: "num", value: token[1] };
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
      let node: AstNode = { type: "id", name: token[1] };
      // Check for array indexing: array[0]
      while (this.peek()?.[0] === "group" && this.peek()![1] === "[") {
        this.consume(); // "["
        const index = this.parseAddSub();
        if (this.peek()?.[0] !== "group" || this.peek()![1] !== "]")
          throw new Error("Expected ]");
        this.consume(); // "]"
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
      else strTokens.push(["num", Number(text)]);
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
