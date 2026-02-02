"use strict";

const { node } = require("../ast/nodes");
const { parseExpression } = require("./expr");

class Parser {
  constructor(tokens, filePath, source) {
    this.tokens = tokens;
    this.filePath = filePath;
    this.source = source;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  next() {
    return this.tokens[this.pos++];
  }

  expect(type) {
    const tok = this.peek();
    if (tok.type !== type) {
      this.error(`Expected ${type} but found ${tok.type}`);
    }
    return this.next();
  }

  error(msg) {
    const tok = this.peek();
    throw new Error(
      `${this.filePath}:${tok.span.startLine}:${tok.span.startCol} ${msg}`,
    );
  }

  spanFrom(a, b) {
    const start = a.span || a;
    const end = b.span || b;
    return {
      filePath: this.filePath,
      startLine: start.span ? start.span.startLine : start.startLine,
      startCol: start.span ? start.span.startCol : start.startCol,
      endLine: end.span ? end.span.endLine : end.endLine,
      endCol: end.span ? end.span.endCol : end.endCol,
    };
  }

  parseProgram() {
    const items = [];
    while (this.peek().type !== "eof") {
      items.push(this.parseTopLevelItem());
    }
    return node("Program", { items });
  }

  parseTopLevelItem() {
    const tok = this.peek();
    if (tok.type === "extern") {
      return this.parseExternUse();
    }
    if (tok.type === "fn") {
      return this.parseFnDecl();
    }
    if (tok.type === "struct") {
      return this.parseStructDecl();
    }
    if (tok.type === "enum") {
      return this.parseEnumDecl();
    }
    return this.parseStatement();
  }

  parseExternUse() {
    this.expect("extern");
    this.expect("use");
    this.expect("{");
    const names = [];
    if (this.peek().type !== "}") {
      names.push(this.expect("ident").value);
      while (this.peek().type === ",") {
        this.next();
        names.push(this.expect("ident").value);
      }
    }
    this.expect("}");
    this.expect("from");
    const pkg = this.expect("ident").value;
    this.expect(";");
    return node("ExternUse", { names, pkg });
  }

  parseFnDecl() {
    const start = this.expect("fn");
    const name = this.expect("ident").value;
    this.expect("(");
    const params = [];
    if (this.peek().type !== ")") {
      params.push(this.expect("ident").value);
      while (this.peek().type === ",") {
        this.next();
        params.push(this.expect("ident").value);
      }
    }
    this.expect(")");
    this.expect("=>");
    const body = parseExpression(this);
    this.expect(";");
    return node("FnDecl", {
      name,
      params,
      body,
      span: this.spanFrom(start, body),
    });
  }

  parseStructDecl() {
    this.expect("struct");
    const name = this.expect("ident").value;
    this.expect("{");
    const fields = [];
    while (this.peek().type !== "}") {
      const isMut = this.peek().type === "mut";
      if (isMut) this.next();
      const fieldName = this.expect("ident").value;
      this.expect(";");
      fields.push({ name: fieldName, mutable: isMut });
    }
    this.expect("}");
    return node("StructDecl", { name, fields });
  }

  parseEnumDecl() {
    this.expect("enum");
    const name = this.expect("ident").value;
    this.expect("{");
    const variants = [];
    while (this.peek().type !== "}") {
      variants.push(this.expect("ident").value);
      if (this.peek().type === ",") {
        this.next();
      }
    }
    this.expect("}");
    return node("EnumDecl", { name, variants });
  }

  parseStatement() {
    const tok = this.peek();
    if (tok.type === "let") return this.parseLet();
    if (tok.type === "while") return this.parseWhile();
    if (tok.type === "for") return this.parseFor();
    if (tok.type === "break") {
      this.next();
      this.expect(";");
      return node("BreakStmt", {});
    }
    if (tok.type === "continue") {
      this.next();
      this.expect(";");
      return node("ContinueStmt", {});
    }

    const expr = parseExpression(this);
    if (
      this.peek().type === "=" ||
      ["+=", "-=", "*=", "/=", "%="].includes(this.peek().type)
    ) {
      const op = this.next().type;
      const right = parseExpression(this);
      this.expect(";");
      return node("AssignStmt", { target: expr, op, right });
    }
    this.expect(";");
    return node("ExprStmt", { expr });
  }

  parseLet() {
    this.expect("let");
    const mutable = this.peek().type === "mut";
    if (mutable) this.next();
    const name = this.expect("ident").value;
    this.expect("=");
    const expr = parseExpression(this);
    this.expect(";");
    return node("LetStmt", { name, mutable, expr });
  }

  parseWhile() {
    this.expect("while");
    this.expect("(");
    const condition = parseExpression(this);
    this.expect(")");
    const body = parseExpression(this);
    return node("WhileStmt", { condition, body });
  }

  parseFor() {
    this.expect("for");
    this.expect("(");
    const name = this.expect("ident").value;
    this.expect("in");
    const start = parseExpression(this);
    this.expect("..");
    const end = parseExpression(this);
    this.expect(")");
    const body = parseExpression(this);
    return node("ForStmt", { name, start, end, body });
  }

  parseStructLiteral() {
    this.expect("{");
    const values = [];
    if (this.peek().type !== "}") {
      values.push(parseExpression(this));
      while (this.peek().type === ",") {
        this.next();
        values.push(parseExpression(this));
      }
    }
    this.expect("}");
    return values;
  }

  parseArrayLiteral() {
    const start = this.expect("[");
    if (this.peek().type === "]") {
      this.next();
      return node("ArrayLiteral", { elements: [], span: start.span });
    }
    const first = parseExpression(this);
    if (this.peek().type === ";") {
      this.next();
      const count = parseExpression(this);
      this.expect("]");
      return node("ArrayRepeat", {
        value: first,
        count,
        span: this.spanFrom(first, count),
      });
    }
    const elements = [first];
    while (this.peek().type === ",") {
      this.next();
      elements.push(parseExpression(this));
    }
    this.expect("]");
    return node("ArrayLiteral", {
      elements,
      span: this.spanFrom(start, elements[elements.length - 1] || start),
    });
  }

  parseBlockExpr() {
    const start = this.expect("{");
    const statements = [];
    let tail = null;
    while (this.peek().type !== "}") {
      if (
        this.peek().type === "let" ||
        this.peek().type === "while" ||
        this.peek().type === "for" ||
        this.peek().type === "break" ||
        this.peek().type === "continue"
      ) {
        statements.push(this.parseStatement());
        continue;
      }
      const expr = parseExpression(this);
      if (this.peek().type === ";") {
        this.next();
        statements.push(node("ExprStmt", { expr }));
      } else {
        tail = expr;
        break;
      }
    }
    this.expect("}");
    return node("BlockExpr", {
      statements,
      tail,
      span: this.spanFrom(start, tail || start),
    });
  }

  parseFnExpr() {
    const start = this.expect("fn");
    this.expect("(");
    const params = [];
    if (this.peek().type !== ")") {
      params.push(this.expect("ident").value);
      while (this.peek().type === ",") {
        this.next();
        params.push(this.expect("ident").value);
      }
    }
    this.expect(")");
    this.expect("=>");
    const body = parseExpression(this);
    return node("FnExpr", { params, body, span: this.spanFrom(start, body) });
  }

  parseIfExpr() {
    const start = this.expect("if");
    this.expect("(");
    const condition = parseExpression(this);
    this.expect(")");
    const thenBranch = parseExpression(this);
    let elseBranch = null;
    if (this.peek().type === "else") {
      this.next();
      elseBranch = parseExpression(this);
    }
    return node("IfExpr", {
      condition,
      thenBranch,
      elseBranch,
      span: this.spanFrom(start, elseBranch || thenBranch),
    });
  }

  parseMatchExpr() {
    const start = this.expect("match");
    this.expect("(");
    const expr = parseExpression(this);
    this.expect(")");
    this.expect("{");
    const cases = [];
    while (this.peek().type !== "}") {
      this.expect("case");
      const pattern = this.parsePattern();
      this.expect("=>");
      const body = parseExpression(this);
      this.expect(";");
      cases.push({ pattern, body });
    }
    this.expect("}");
    return node("MatchExpr", { expr, cases, span: this.spanFrom(start, expr) });
  }

  parsePattern() {
    const tok = this.peek();
    if (tok.type === "_") {
      this.next();
      return node("WildcardPattern", { span: tok.span });
    }
    if (tok.type === "number" || tok.type === "string" || tok.type === "char") {
      this.next();
      return node("LiteralPattern", {
        value: tok.value,
        literalType: tok.type,
        span: tok.span,
      });
    }
    if (tok.type === "true" || tok.type === "false") {
      this.next();
      return node("LiteralPattern", {
        value: tok.type === "true",
        literalType: "bool",
        span: tok.span,
      });
    }
    if (tok.type === "null") {
      this.next();
      return node("NullPattern", { span: tok.span });
    }
    if (tok.type === "ident" && this.peek(1).type === "::") {
      const enumName = this.next().value;
      this.next();
      const variant = this.expect("ident").value;
      return node("EnumPattern", { enumName, variant });
    }
    if (tok.type === "ident") {
      const name = this.next().value;
      return node("IdentifierPattern", { name });
    }
    this.error(`Unexpected pattern token: ${tok.type}`);
  }

  parseCallArgs() {
    this.expect("(");
    const args = [];
    if (this.peek().type !== ")") {
      args.push(parseExpression(this));
      while (this.peek().type === ",") {
        this.next();
        args.push(parseExpression(this));
      }
    }
    this.expect(")");
    return args;
  }

  parseScopedVariant() {
    const enumTok = this.expect("ident");
    this.expect("::");
    const variantTok = this.expect("ident");
    return {
      enumName: enumTok.value,
      variant: variantTok.value,
      span: this.spanFrom(enumTok, variantTok),
    };
  }
}

function parse(tokens, filePath, source) {
  const parser = new Parser(tokens, filePath, source);
  return parser.parseProgram();
}

module.exports = { parse };
