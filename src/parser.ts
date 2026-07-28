import type { AstNode } from "./ast";
import type { Token } from "./tokenizer";
import type { BinaryOp } from "./grammar";
import { OPENING, PRECEDENCE } from "./grammar";

/**
 * Recursive-descent parser for the Tuff language.
 * Encapsulates mutable state (position, tokens) as class members.
 */
class Parser {
  private pos = 0;
  /** When true, skip the "block ends with declaration" check (top-level statement context). */
  private skipBlockCheck = false;

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
   * A standalone `{ let y = 100; }` is allowed at top level (statement context),
   * but `{ let y = 100; }` used as an expression (e.g., RHS of `let`) is an error.
   */
  private parseTopLevelStatement(): AstNode {
    const stmt = this.tryParseKnownStatement();
    if (stmt) return stmt;
    this.skipBlockCheck = true;
    try {
      return this.parseExpression();
    } finally {
      this.skipBlockCheck = false;
    }
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
   * Parse a block in statement context: `{ statement* }`
   * No restrictions on the last statement.
   */
  private parseBlockStmt(): AstNode {
    const statements = this.collectBlockStatements();
    return { kind: "block", statements };
  }

  /**
   * Parse a block in expression context: `{ statement* expression }`
   * The last statement must be an expression, not a declaration.
   * Skips the check when `skipBlockCheck` is true (top-level statement context).
   */
  private parseBlockExpr(): AstNode {
    const statements = this.collectBlockStatements();
    if (!this.skipBlockCheck) {
      const last = statements[statements.length - 1];
      if (last?.kind === "let") {
        throw new Error(
          "Block used as expression cannot end with a declaration",
        );
      }
    }
    return { kind: "block", statements };
  }

  private parseStatement(): AstNode {
    if (this.match("group", "{")) {
      this.consume();
      return this.parseBlockStmt();
    }
    const stmt = this.tryParseKnownStatement();
    if (stmt) return stmt;
    return this.parseExpression();
  }

  /** Try to parse a known statement (`let`, `if`, `break`, or `identifier = expr`). Returns undefined if none match. */
  private tryParseKnownStatement(): AstNode | undefined {
    if (this.match("keyword", "let")) return this.parseLetStatement();
    if (this.match("keyword", "if")) return this.parseIfStatement();
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

  /** Try to parse `identifier = expression` as an assignment statement. Returns undefined if not an assignment. */
  private tryParseAssign(): AstNode | undefined {
    if (!this.match("identifier")) return;
    const nameToken = this.peek()!;
    const nextPos = this.pos + 1;
    const nextToken = this.tokens[nextPos];
    if (nextToken?.type !== "operator" || nextToken.value !== "=") return;
    this.consume(); // identifier
    this.consume(); // =
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
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
    if (this.match("operator", "=")) {
      this.consume();
    }
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    return { kind: "let", name, value, mutable };
  }

  private parseAtom(): AstNode {
    if (this.match("number")) {
      const t = this.consume()!;
      return { kind: "number", value: t.value as number };
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
      return { kind: "identifier", name: t.value as string };
    }
    const token = this.peek();
    if (token?.type === "group" && token.value in OPENING) {
      this.consume();
      if (token.value === "{") {
        return this.parseBlockExpr();
      }
      const node = this.parseExpression();
      if (this.match("group", OPENING[token.value])) {
        this.consume();
      }
      return node;
    }
    return { kind: "number", value: 0 };
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

  private parseLoopExpression(): AstNode {
    this.consume(); // eat "loop"
    this.expect("group", "{");
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
    return { kind: "loop", body };
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
    return this.parseBinary(0, () => this.parseAtom());
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
