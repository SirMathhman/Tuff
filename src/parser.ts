import type { AstNode } from "./ast";
import type { Token } from "./tokenizer";
import type { BinaryOp } from "./grammar";
import type { Type } from "./types";
import { OPENING, PRECEDENCE } from "./grammar";
import { parseTypeName } from "./types";

/**
 * Recursive-descent parser for the Tuff language.
 * Encapsulates mutable state (position, tokens) as class members.
 */
class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  /* ---- low-level token access ---- */

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  match(type: string, value?: string): boolean {
    const t = this.peek();
    if (t?.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  expect(type: string, value?: string): Token {
    const t = this.peek();
    if (t?.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Expected ${type}${value !== undefined ? ` '${value}'` : ""}, got ${t?.type} '${t?.value}'`,
      );
    }
    return this.consume()!;
  }

  /* ---- public entry point ---- */

  parse(): AstNode {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length) {
      const prevPos = this.pos;
      statements.push(this.parseTopLevelStatement());
      // Guard against infinite loops: if pos didn't advance, skip the token.
      if (prevPos === this.pos) {
        this.pos++;
      }
    }
    if (statements.length === 0) return { kind: "number", value: 0 };
    if (statements.length === 1) return statements[0]!;
    return { kind: "block", statements };
  }

  /**
   * Parse a top-level statement.
   * `let` is a statement; everything else (including `{ ... }`) is an expression.
   */
  private parseTopLevelStatement(): AstNode {
    const stmt = this.tryParseKnownStatement();
    if (stmt) return stmt;
    return this.parseExpression();
  }

  /* ---- grammar rules ---- */

  /**
   * Collect statements until closing "}", consuming the brace.
   */
  private collectBlockStatements(): AstNode[] {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length) {
      if (this.match("group", "}")) {
        this.consume();
        break;
      }
      const prevPos = this.pos;
      const stmt = this.parseStatement();
      if (prevPos === this.pos) {
        this.pos++;
      }
      statements.push(stmt);
    }
    return statements;
  }

  /**
   * Parse a block: `{ statement* }`
   * Semantic checks (void type, declaration restrictions) are handled by the analyzer.
   */
  private parseBlock(): AstNode {
    const statements = this.collectBlockStatements();
    return { kind: "block", statements };
  }

  private parseStatement(): AstNode {
    if (this.match("group", "{")) {
      this.consume();
      return this.parseBlock();
    }
    const stmt = this.tryParseKnownStatement();
    if (stmt) return stmt;
    return this.parseExpression();
  }

  /** Try to parse a known statement (`let`, `fn`, `if`, `while`, `break`, or `identifier = expr`). Returns undefined if none match. */
  private tryParseKnownStatement(): AstNode | undefined {
    if (this.match("keyword", "let")) return this.parseLetStatement();
    if (this.match("keyword", "fn")) return this.parseFnStatement();
    if (this.match("keyword", "if")) return this.parseIfStatement();
    if (this.match("keyword", "while")) return this.parseWhileStatement();
    if (this.match("keyword", "break")) {
      this.consume();
      const value = this.parseExpression();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "break", value };
    }
    const assign = this.tryParseAssign();
    if (assign) return assign;
  }

  /** Try to parse `identifier = expression` or `identifier += expression` as an assignment statement. Returns undefined if not an assignment. */
  private tryParseAssign(): AstNode | undefined {
    if (!this.match("identifier")) return;
    const nameToken = this.peek()!;
    const nextPos = this.pos + 1;
    const nextToken = this.tokens[nextPos];
    if (nextToken?.type !== "operator") return;
    const op = nextToken.value;
    if (op !== "=" && op !== "+=") return;
    this.consume(); // identifier
    this.consume(); // operator
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    if (op === "+=") {
      return {
        kind: "augassign",
        name: nameToken.value as string,
        op: "+",
        value,
      };
    }
    return { kind: "assign", name: nameToken.value as string, value };
  }

  private parseLetStatement(): AstNode {
    this.consume(); // eat "let"
    const mutable = this.match("keyword", "mut");
    if (mutable) this.consume();
    const nameToken = this.peek();
    let name = "";
    if (nameToken?.type === "identifier") {
      name = nameToken.value;
      this.consume();
    }
    // Parse optional type annotation: `: TypeName`
    const declaredType = this.parseTypeAnnotation();
    if (this.match("operator", "=")) {
      this.consume();
    }
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    return { kind: "let", name, value, mutable, type: declaredType };
  }

  /** Parse optional `: TypeName` and return the type, or undefined. */
  private parseTypeAnnotation(): Type | undefined {
    if (this.match("punctuator", ":")) {
      this.consume();
      const typeToken = this.peek();
      if (typeToken?.type === "identifier") {
        const type = parseTypeName(typeToken.value);
        this.consume();
        return type;
      }
    }
    return undefined;
  }

  /** Parse `fn name(params) => body`. */
  private parseFnStatement(): AstNode {
    this.consume(); // eat "fn"
    const nameToken = this.peek();
    let name = "";
    if (nameToken?.type === "identifier") {
      name = nameToken.value;
      this.consume();
    }
    // Parse parameters: `(param1 : Type1, param2 : Type2, ...)`
    this.expect("group", "(");
    const params: { name: string; type?: Type }[] = [];
    while (!this.match("group", ")")) {
      const paramToken = this.peek();
      if (paramToken?.type === "identifier") {
        this.consume();
        const paramType = this.parseTypeAnnotation();
        params.push({ name: paramToken.value, type: paramType });
        if (this.match("punctuator", ",")) {
          this.consume();
        }
      } else {
        break;
      }
    }
    this.expect("group", ")");
    // Optional return type annotation: `: TypeName`
    const returnType = this.parseTypeAnnotation();
    // Parse `=>`
    this.expect("operator", "=>");
    const body = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    return { kind: "fn", name, params, returnType, body };
  }

  private parseAtom(): AstNode {
    if (this.match("number")) {
      const t = this.consume()!;
      const suffix = (t as { typeSuffix?: string }).typeSuffix;
      return {
        kind: "number",
        value: t.value as number,
        type: suffix ? parseTypeName(suffix) : undefined,
      };
    }
    if (this.match("keyword", "true")) {
      this.consume();
      return { kind: "boolean", value: true };
    }
    if (this.match("keyword", "false")) {
      this.consume();
      return { kind: "boolean", value: false };
    }
    if (this.match("keyword", "if")) {
      return this.parseIfExpression();
    }
    if (this.match("keyword", "loop")) {
      return this.parseLoopExpression();
    }
    if (this.match("identifier")) {
      const t = this.consume()!;
      const name = t.value as string;
      // Check for function call: `identifier(args)`
      if (this.match("group", "(")) {
        this.consume();
        const args: AstNode[] = [];
        while (!this.match("group", ")")) {
          args.push(this.parseExpression());
          if (this.match("punctuator", ",")) {
            this.consume();
          }
        }
        this.expect("group", ")");
        return { kind: "call", callee: { kind: "identifier", name }, args };
      }
      return { kind: "identifier", name };
    }
    const token = this.peek();
    if (token?.type === "group" && token.value in OPENING) {
      this.consume();
      if (token.value === "{") {
        return this.parseBlock();
      }
      const node = this.parseExpression();
      if (this.match("group", OPENING[token.value])) {
        this.consume();
      }
      return node;
    }
    throw new Error(`Unexpected token: ${token?.value}`);
  }

  /** Parse unary expressions: `-expr`. */
  private parseUnary(): AstNode {
    if (this.match("operator", "-")) {
      this.consume();
      const operand = this.parseUnary();
      return { kind: "unary", op: "-", operand };
    }
    let node = this.parseAtom();
    // Handle postfix `is TypeName` — supports chaining: `expr is T1 is T2`
    while (this.match("keyword", "is")) {
      this.consume();
      const typeToken = this.peek();
      if (typeToken?.type === "identifier") {
        const type = parseTypeName(typeToken.value);
        this.consume();
        node = { kind: "typecheck", value: node, type };
      } else {
        break;
      }
    }
    return node;
  }

  private parseIfExpression(): AstNode {
    this.consume(); // eat "if"
    this.expect("group", "(");
    const condition = this.parseExpression();
    this.expect("group", ")");
    const thenBranch = this.parseExpression();
    this.expect("keyword", "else");
    const elseBranch = this.parseExpression();
    return { kind: "if", condition, then: thenBranch, elseBranch };
  }

  private parseIfStatement(): AstNode {
    this.consume(); // eat "if"
    this.expect("group", "(");
    const condition = this.parseExpression();
    this.expect("group", ")");
    const thenBranch = this.parseStatement();
    if (this.match("keyword", "else")) {
      this.consume();
      if (this.match("keyword", "if")) {
        const elseBranch = this.parseIfStatement();
        return { kind: "if", condition, then: thenBranch, elseBranch };
      }
      const elseBranch = this.parseStatement();
      return { kind: "if", condition, then: thenBranch, elseBranch };
    }
    return {
      kind: "if",
      condition,
      then: thenBranch,
      elseBranch: { kind: "number", value: 0 },
    };
  }

  private parseWhileStatement(): AstNode {
    this.consume(); // eat "while"
    this.expect("group", "(");
    const condition = this.parseExpression();
    this.expect("group", ")");
    this.expect("group", "{");
    const body = this.collectBody();
    return { kind: "while", condition, body };
  }

  private parseLoopExpression(): AstNode {
    this.consume(); // eat "loop"
    this.expect("group", "{");
    const body = this.collectBody();
    return { kind: "loop", body };
  }

  /** Collect body statements between `{` and `}`, consuming the closing brace. */
  private collectBody(): AstNode[] {
    const body: AstNode[] = [];
    while (this.pos < this.tokens.length && !this.match("group", "}")) {
      const prevPos = this.pos;
      const stmt = this.parseStatement();
      if (prevPos === this.pos) {
        this.pos++;
      }
      body.push(stmt);
    }
    this.expect("group", "}");
    return body;
  }

  /**
   * Table-driven binary expression parser.
   * `level` indexes into PRECEDENCE (lowest first).
   * `lower` is the highest-precedence parser (atom).
   */
  private parseBinary(level: number, lower: () => AstNode): AstNode {
    if (level >= PRECEDENCE.length) return lower();
    const ops = PRECEDENCE[level]!;
    let node = this.parseBinary(level + 1, lower);
    while (this.pos < this.tokens.length) {
      const op = this.peek();
      if (op?.type === "operator" && ops.includes(op.value as string)) {
        this.consume();
        const right = this.parseBinary(level + 1, lower);
        node = {
          kind: "binary",
          op: op.value as BinaryOp,
          left: node,
          right,
        };
      } else {
        break;
      }
    }
    return node;
  }

  private parseExpression(): AstNode {
    return this.parseBinary(0, () => this.parseUnary());
  }
}

/**
 * Parse a token array into an AST node using recursive descent.
 *
 * Grammar (simplified):
 *   statement : let_decl | expression
 *   let_decl  : "let" IDENT "=" expression ";"
 *   block     : "{" statement* "}"
 *   expression: binary_op_chain
 *   atom      : NUMBER | IDENT | "(" expression ")" | block
 */
export function parse(tokens: Token[]): AstNode {
  return new Parser(tokens).parse();
}
