import type { Token, AstNode, Expr } from "./types";

export class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  peek(): Token {
    return this.tokens[this.pos]!;
  }

  consume(): Token {
    return this.tokens[this.pos++]!;
  }

  parse(): AstNode[] {
    const nodes: AstNode[] = [];
    while (this.peek().type !== "eof") {
      nodes.push(this.parseStmt(true));
    }
    return nodes;
  }

  parseStmt(allowIn: boolean): AstNode {
    const tok = this.peek();
    if (allowIn && tok.type === "keyword" && tok.value === "in") {
      return this.parseDecl();
    }
    if (tok.type === "keyword" && tok.value === "let") {
      return this.parseLetDecl();
    }
    if (tok.type === "keyword" && tok.value === "while") {
      return this.parseWhile();
    }
    if (tok.type === "keyword" && tok.value === "for") {
      return this.parseFor();
    }
    if (tok.type === "keyword" && tok.value === "break") {
      this.consume();
      const semi = this.peek();
      if (semi.type === "punct" && semi.value === ";") this.consume();
      return { type: "break" };
    }
    if (tok.type === "keyword" && tok.value === "continue") {
      this.consume();
      const semi = this.peek();
      if (semi.type === "punct" && semi.value === ";") this.consume();
      return { type: "continue" };
    }
    if (tok.type === "identifier") {
      const next = this.tokens[this.pos + 1];
      if (
        next &&
        ((next.type === "punct" && next.value === "=") ||
          (next.type === "op" && next.value === "+="))
      ) {
        return this.parseAssignStmt();
      }
      if (next && next.type === "punct" && next.value === "[") {
        let idx = this.pos + 2;
        while (idx < this.tokens.length && this.tokens[idx]!.type !== "eof") {
          const t = this.tokens[idx]!;
          if (t.type === "punct" && t.value === "]") {
            const afterBracket = this.tokens[idx + 1];
            if (
              afterBracket &&
              ((afterBracket.type === "punct" && afterBracket.value === "=") ||
                (afterBracket.type === "op" && afterBracket.value === "+="))
            ) {
              return this.parseAssignStmt();
            }
            break;
          }
          idx++;
        }
      }
    }
    const node = this.parseExprNode();
    const semi = this.peek();
    if (semi.type === "punct" && semi.value === ";") this.consume();
    return node;
  }

  parseWhile(): AstNode {
    this.consume();
    const openTok = this.peek();
    if (openTok.type !== "punct" || openTok.value !== "(") {
      throw new Error("Expected '(' after 'while'");
    }
    this.consume();
    const condition = this.parseExpr();
    const closeTok = this.peek();
    if (closeTok.type !== "punct" || closeTok.value !== ")") {
      throw new Error("Expected ')' after while condition");
    }
    this.consume();
    const body = this.parseLoopBody();
    return { type: "while", condition, body };
  }

  parseLoopBody(): AstNode[] {
    const body: AstNode[] = [];
    const tok = this.peek();
    if (tok.type === "punct" && tok.value === "{") {
      this.consume();
      while (this.peek().type !== "eof") {
        const t = this.peek();
        if (t.type === "punct" && t.value === "}") {
          this.consume();
          break;
        }
        body.push(this.parseStmt(false));
      }
    } else {
      body.push(this.parseStmt(false));
    }
    return body;
  }

  parseFor(): AstNode {
    this.consume();
    const openTok = this.peek();
    if (openTok.type !== "punct" || openTok.value !== "(") {
      throw new Error("Expected '(' after 'for'");
    }
    this.consume();
    const varName = this.consumeIdentifier();
    const inTok = this.peek();
    if (inTok.type !== "keyword" || inTok.value !== "in") {
      throw new Error("Expected 'in' after loop variable");
    }
    this.consume();
    const parsedRange = this.parseExpr();
    let rangeExpr: Expr;
    if (parsedRange.type === "binary" && parsedRange.op === "..") {
      rangeExpr = { type: "range", start: parsedRange.left, end: parsedRange.right };
    } else if (parsedRange.type === "identifier") {
      rangeExpr = parsedRange;
    } else {
      throw new Error("Expected range expression or range variable");
    }
    const closeTok = this.peek();
    if (closeTok.type !== "punct" || closeTok.value !== ")") {
      throw new Error("Expected ')' after for range");
    }
    this.consume();
    const body = this.parseLoopBody();
    return { type: "for", varName, rangeExpr, body };
  }

  parseLetDecl(): AstNode {
    this.consume();
    const mutTok = this.peek();
    const mutable = mutTok.type === "keyword" && mutTok.value === "mut";
    if (mutable) this.consume();
    const name = this.consumeIdentifier();
    const eqTok = this.peek();
    if (eqTok.type === "punct" && eqTok.value === "=") {
      this.consume();
      const init = this.parseExpr();
      const semiTok = this.peek();
      if (semiTok.type === "punct" && semiTok.value === ";") this.consume();
      return { type: "let", name, mutable, init };
    }
    const semiTok = this.peek();
    if (semiTok.type === "punct" && semiTok.value === ";") this.consume();
    return { type: "let", name, mutable, init: { type: "number", value: 0, intType: false } };
  }

  parseAssignStmt(): AstNode {
    const name = this.consumeIdentifier();
    const target = this.parseIndexChain({ type: "identifier", name });
    const opTok = this.peek();
    let value: Expr;
    if (opTok.type === "op" && opTok.value === "+=") {
      this.consume();
      value = { type: "binary", op: "+", left: target, right: this.parseExpr() };
    } else if (opTok.type === "punct" && opTok.value === "=") {
      this.consume();
      value = this.parseExpr();
    } else {
      throw new Error(`Expected '=' after identifier`);
    }
    const semiTok = this.peek();
    if (semiTok.type === "punct" && semiTok.value === ";") this.consume();
    return { type: "assign", target, value };
  }

  parseDecl(): AstNode {
    this.consume();
    const tok = this.peek();
    if (tok.type !== "keyword" || tok.value !== "let") {
      throw new Error("Expected 'let' after 'in'");
    }
    this.consume();
    const name = this.consumeIdentifier();
    if (this.peek().type === "punct") this.consume();
    return { type: "decl", name };
  }

  parseExprNode(): AstNode {
    const expr = this.parseExpr();
    return { type: "expr", expr };
  }

  parseExpr(): Expr {
    let left = this.parsePrimary();
    while (true) {
      const next = this.peek();
      if (next.type !== "op" || next.value === "=>" || next.value === ">>") break;
      this.consume();
      const right = this.parsePrimary();
      left = { type: "binary", op: next.value, left, right };
    }
    return left;
  }

  parsePrimary(): Expr {
    const token = this.peek();
    if (token.type === "op" && token.value === "-") {
      this.consume();
      const operand = this.parsePrimary();
      return { type: "unary", op: "-", operand };
    }
    this.consume();
    if (token.type === "number") {
      return { type: "number", value: parseInt(token.value, 10), intType: token.intType };
    }
    if (token.type === "boolean") {
      return { type: "boolean", value: token.value };
    }
    if (token.type === "punct" && token.value === "(") {
      const expr = this.parseExpr();
      const closingTok = this.peek();
      if (closingTok.type !== "punct" || closingTok.value !== ")") {
        throw new Error("Expected ')'");
      }
      this.consume();
      return { type: "group", nodes: [{ type: "expr", expr }] };
    }
    if (token.type === "punct" && token.value === "{") {
      const nodes = this.parseBlock();
      return { type: "group", nodes };
    }
    if (token.type === "keyword" && token.value === "if") {
      const openTok = this.peek();
      if (openTok.type !== "punct" || openTok.value !== "(") {
        throw new Error("Expected '(' after 'if'");
      }
      this.consume();
      const condition = this.parseExpr();
      const closeTok = this.peek();
      if (closeTok.type !== "punct" || closeTok.value !== ")") {
        throw new Error("Expected ')' after condition");
      }
      this.consume();
      const thenNode = this.parseStmt(false);
      const elseTok = this.peek();
      if (elseTok.type === "keyword" && elseTok.value === "else") {
        this.consume();
        const elseNode = this.parseStmt(false);
        return { type: "if", condition, thenNode, elseNode };
      }
      return { type: "if", condition, thenNode, elseNode: null };
    }
    if (token.type === "keyword" && token.value === "match") {
      const openTok = this.peek();
      if (openTok.type !== "punct" || openTok.value !== "(") {
        throw new Error("Expected '(' after 'match'");
      }
      this.consume();
      const target = this.parseExpr();
      const closeTok = this.peek();
      if (closeTok.type !== "punct" || closeTok.value !== ")") {
        throw new Error("Expected ')' after match target");
      }
      this.consume();
      const braceTok = this.peek();
      if (braceTok.type !== "punct" || braceTok.value !== "{") {
        throw new Error("Expected '{' after match target");
      }
      this.consume();
      const cases: { pattern: Expr; body: Expr }[] = [];
      while (true) {
        const tok = this.peek();
        if (tok.type === "eof" || (tok.type === "punct" && tok.value === "}")) {
          if (tok.type === "punct") this.consume();
          break;
        }
        if (tok.type === "keyword" && tok.value === "case") {
          this.consume();
          const pattern = this.parseExpr();
          const arrowTok = this.peek();
          if (arrowTok.type !== "op" || arrowTok.value !== "=>") {
            throw new Error("Expected '=>' after case pattern");
          }
          this.consume();
          const body = this.parseExpr();
          cases.push({ pattern, body });
          const semi = this.peek();
          if (semi.type === "punct" && semi.value === ";") this.consume();
        } else {
          throw new Error(`Expected 'case' in match block`);
        }
      }
      return { type: "match", target, cases };
    }
    if (token.type === "punct" && token.value === "[") {
      const elements: Expr[] = [];
      while (true) {
        const tok = this.peek();
        if (tok.type === "eof" || (tok.type === "punct" && tok.value === "]")) {
          if (tok.type === "punct") this.consume();
          break;
        }
        elements.push(this.parseExpr());
        const comma = this.peek();
        if (comma.type === "punct" && comma.value === ",") this.consume();
      }
      return { type: "array", elements };
    }
    if (token.type === "identifier") {
      return this.parseIndexChain({ type: "identifier", name: token.value });
    }
    throw new Error(`Unexpected token: ${token.type}`);
  }

  parseBlock(): AstNode[] {
    const nodes: AstNode[] = [];
    while (this.peek().type !== "eof") {
      const tok = this.peek();
      if (tok.type === "punct" && tok.value === "}") {
        this.consume();
        break;
      }
      nodes.push(this.parseStmt(false));
    }
    return nodes;
  }

  consumeIdentifier(): string {
    const token = this.peek();
    if (token.type === "identifier") {
      this.consume();
      return token.value;
    }
    throw new Error("Expected identifier");
  }

  parseIndexChain(base: Expr): Expr {
    let result = base;
    while (true) {
      const next = this.peek();
      if (next.type !== "punct" || next.value !== "[") break;
      this.consume();
      const index = this.parseExpr();
      const closeTok = this.peek();
      if (closeTok.type !== "punct" || closeTok.value !== "]") {
        throw new Error("Expected ']'");
      }
      this.consume();
      result = { type: "index", target: result, index };
    }
    return result;
  }
}
