// ============================================================
// Tuff MVP Compiler — Lexer → Parser → CodeGen → CLI
// Target: JavaScript (ES2020)
// ============================================================

// ---- Token Types ----

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOL"
  | "IDENT"
  | "KEYWORD"
  | "OP"
  | "COLON"
  | "EQ"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "SEMI"
  | "DOT"
  | "ARROW"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ---- Lexer ----

const KEYWORDS = new Set(["let", "fn", "if", "else", "while", "true", "false"]);

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  function peek(): string | undefined {
    return source[i];
  }

  function advance(): string | undefined {
    const ch = source[i];
    i++;
    col++;
    return ch;
  }

  function skipWhitespace() {
    let iterations = 0;
    while (i < source.length && /\s/.test(source[i])) {
      if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
      if (source[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  }

  function skipComment() {
    if (source[i] === "/" && source[i + 1] === "/") {
      // Single-line comment
      let iterations = 0;
      while (i < source.length && source[i] !== "\n") {
        if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
        i++;
        col++;
      }
    } else if (source[i] === "/" && source[i + 1] === "*") {
      // Multi-line comment
      i += 2;
      col += 2;
      let iterations = 0;
      while (i < source.length - 1 && !(source[i] === "*" && source[i + 1] === "/")) {
        if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
        if (source[i] === "\n") {
          line++;
          col = 1;
        } else {
          col++;
        }
        i++;
      }
      i += 2; // skip */
      col += 2;
    }
  }

  function makeToken(type: TokenType, value: string, startLine: number, startCol: number): Token {
    return { type, value, line: startLine, col: startCol };
  }

  let iterations = 0;
  while (i < source.length) {
    if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
    skipWhitespace();
    if (i >= source.length) break;

    // Skip comments
    if (source[i] === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) {
      skipComment();
      continue;
    }

    const startLine = line;
    const startCol = col;
    const ch = source[i];

    // Strings
    if (ch === '"') {
      let str = "";
      i++; // skip opening "
      col++;
      let iterations = 0;
      while (i < source.length && source[i] !== '"') {
        if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
        if (source[i] === "\\") {
          i++;
          col++;
          if (i < source.length) {
            str += source[i];
          }
        } else {
          str += source[i];
        }
        i++;
        col++;
      }
      if (source[i] !== '"') {
        throw new Error(`Unterminated string at line ${line}:${col}`);
      }
      i++; // skip closing "
      col++;
      tokens.push(makeToken("STRING", str, startLine, startCol));
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let num = "";
      let iterations = 0;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
        num += source[i];
        i++;
        col++;
      }
      tokens.push(makeToken("NUMBER", num, startLine, startCol));
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = "";
      let iterations = 0;
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) {
        if (++iterations > 1024) throw new Error(`Lexer loop exceeded 1024 iterations at line ${line}:${col}`);
        ident += source[i];
        i++;
        col++;
      }
      if (ident === "true" || ident === "false") {
        tokens.push(makeToken("BOOL", ident, startLine, startCol));
      } else if (KEYWORDS.has(ident)) {
        tokens.push(makeToken("KEYWORD", ident, startLine, startCol));
      } else {
        tokens.push(makeToken("IDENT", ident, startLine, startCol));
      }
      continue;
    }

    // Two-character operators
    if (i + 1 < source.length) {
      const two = source[i] + source[i + 1];
      if (["==", "!=", "<=", ">=", "=>"].includes(two)) {
        tokens.push(makeToken(two === "=>" ? "ARROW" : "OP", two, startLine, startCol));
        i += 2;
        col += 2;
        continue;
      }
    }

    // Single-character tokens
    const singleCharMap: Record<string, TokenType> = {
      "(": "LPAREN",
      ")": "RPAREN",
      "{": "LBRACE",
      "}": "RBRACE",
      "[": "LBRACKET",
      "]": "RBRACKET",
      ",": "COMMA",
      ";": "SEMI",
      ".": "DOT",
      ":": "COLON",
      "=": "EQ",
      "+": "OP",
      "-": "OP",
      "*": "OP",
      "/": "OP",
      "%": "OP",
      "<": "OP",
      ">": "OP",
    };

    if (singleCharMap[ch]) {
      tokens.push(makeToken(singleCharMap[ch], ch, startLine, startCol));
      i++;
      col++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at line ${line}:${col}`);
  }

  tokens.push({ type: "EOF", value: "", line, col });
  return tokens;
}

// ---- AST ----

export type ASTNode =
  | { kind: "Program"; body: ASTNode[] }
  | { kind: "Let"; name: string; value: ASTNode }
  | { kind: "Fn"; name: string; params: string[]; body: ASTNode }
  | { kind: "If"; cond: ASTNode; thenBody: ASTNode[]; elseBody: ASTNode[] }
  | { kind: "While"; cond: ASTNode; body: ASTNode[] }
  | { kind: "Block"; body: ASTNode[] }
  | { kind: "Binary"; op: string; left: ASTNode; right: ASTNode }
  | { kind: "Unary"; op: string; operand: ASTNode }
  | { kind: "Call"; callee: ASTNode; args: ASTNode[] }
  | { kind: "Index"; obj: ASTNode; index: ASTNode }
  | { kind: "Property"; obj: ASTNode; prop: string }
  | { kind: "ArrayLit"; elements: ASTNode[] }
  | { kind: "ObjectLit"; properties: { key: string; value: ASTNode }[] }
  | { kind: "Ident"; name: string }
  | { kind: "Number"; value: number }
  | { kind: "String"; value: string }
  | { kind: "Bool"; value: boolean };

// ---- Parser ----

export function parse(tokens: Token[]): ASTNode {
  let pos = 0;

  function peek(): Token {
    return tokens[pos];
  }

  function advance(): Token {
    return tokens[pos++];
  }

  function expect(type: TokenType, value?: string): Token {
    const token = advance();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(
        `Expected ${type}${value ? ` '${value}'` : ""} at line ${token.line}:${token.col}, got '${token.value}'`
      );
    }
    return token;
  }

  function eof(): boolean {
    return peek().type === "EOF";
  }

  // ---- Expressions ----

  function parseExpression(): ASTNode {
    return parseComparison();
  }

  let parseIterations = 0;
  function checkParseLoop() {
    if (++parseIterations > 1024) throw new Error(`Parser loop exceeded 1024 iterations`);
  }

  function parseComparison(): ASTNode {
    let left = parseAddition();
    while (!eof() && ["==", "!=", "<", ">", "<=", ">="].includes(peek().value)) {
      checkParseLoop();
      const op = advance().value;
      const right = parseAddition();
      left = { kind: "Binary", op, left, right };
    }
    return left;
  }

  function parseAddition(): ASTNode {
    let left = parseMultiplication();
    while (!eof() && ["+", "-"].includes(peek().value)) {
      checkParseLoop();
      const op = advance().value;
      const right = parseMultiplication();
      left = { kind: "Binary", op, left, right };
    }
    return left;
  }

  function parseMultiplication(): ASTNode {
    let left = parseUnary();
    while (!eof() && ["*", "/", "%"].includes(peek().value)) {
      checkParseLoop();
      const op = advance().value;
      const right = parseUnary();
      left = { kind: "Binary", op, left, right };
    }
    return left;
  }

  function parseUnary(): ASTNode {
    if (peek().value === "-") {
      advance();
      const operand = parseUnary();
      return { kind: "Unary", op: "-", operand };
    }
    if (peek().value === "!") {
      advance();
      const operand = parseUnary();
      return { kind: "Unary", op: "!", operand };
    }
    return parsePrimary();
  }

  function parsePrimary(): ASTNode {
    const token = peek();

    // Number literal
    if (token.type === "NUMBER") {
      advance();
      return { kind: "Number", value: parseFloat(token.value) };
    }

    // String literal
    if (token.type === "STRING") {
      advance();
      return { kind: "String", value: token.value };
    }

    // Boolean literal
    if (token.type === "BOOL") {
      advance();
      return { kind: "Bool", value: token.value === "true" };
    }

    // Array literal
    if (token.type === "LBRACKET") {
      return parseArrayLiteral();
    }

    // Object literal
    if (token.type === "LBRACE") {
      return parseObjectLiteral();
    }

    // Parenthesized expression
    if (token.type === "LPAREN") {
      advance();
      const expr = parseExpression();
      expect("RPAREN", ")");
      return expr;
    }

    // Identifier (may be followed by call, index, or property)
    if (token.type === "IDENT") {
      advance();
      let node: ASTNode = { kind: "Ident", name: token.value };

      // Handle chained postfix operators
      while (!eof() && (peek().type === "LPAREN" || peek().type === "LBRACKET" || peek().type === "DOT")) {
        checkParseLoop();
        if (peek().type === "LPAREN") {
          // Function call
          advance(); // consume (
          const args: ASTNode[] = [];
          if (peek().type !== "RPAREN") {
            args.push(parseExpression());
            while (peek().type === "COMMA") {
              checkParseLoop();
              advance();
              if (peek().type !== "RPAREN") {
                args.push(parseExpression());
              }
            }
          }
          expect("RPAREN", ")");
          node = { kind: "Call", callee: node, args };
        } else if (peek().type === "LBRACKET") {
          // Index
          advance(); // consume [
          const index = parseExpression();
          expect("RBRACKET", "]");
          node = { kind: "Index", obj: node, index };
        } else if (peek().type === "DOT") {
          // Property access
          advance(); // consume .
          const propToken = expect("IDENT");
          node = { kind: "Property", obj: node, prop: propToken.value };
        }
      }

      return node;
    }

    throw new Error(`Unexpected token '${token.value}' at line ${token.line}:${token.col}`);
  }

  function parseArrayLiteral(): ASTNode {
    advance(); // consume [
    const elements: ASTNode[] = [];
    if (peek().type !== "RBRACKET") {
      elements.push(parseExpression());
      while (peek().type === "COMMA") {
        checkParseLoop();
        advance();
        if (peek().type !== "RBRACKET") {
          elements.push(parseExpression());
        }
      }
    }
    expect("RBRACKET", "]");
    return { kind: "ArrayLit", elements };
  }

  function parseObjectLiteral(): ASTNode {
    advance(); // consume {
    const properties: { key: string; value: ASTNode }[] = [];

    if (peek().type !== "RBRACE") {
      // Save position to backtrack
      const savedPos = pos;

      // Try to parse as object literal
      const keyToken = advance();
      if (keyToken.type === "IDENT" && peek().type === "COLON") {
        // It's an object literal
        advance(); // consume :
        const value = parseExpression();
        properties.push({ key: keyToken.value, value });

        while (peek().type === "COMMA") {
          checkParseLoop();
          advance();
          if (peek().type !== "RBRACE") {
            const k = expect("IDENT");
            expect("COLON", ":");
            const v = parseExpression();
            properties.push({ key: k.value, value: v });
          }
        }
      } else {
        // Not an object literal, backtrack and parse as block
        pos = savedPos;
        return parseBlock();
      }
    }

    expect("RBRACE", "}");
    return { kind: "ObjectLit", properties };
  }

  // ---- Statements ----

  function parseStatement(): ASTNode | undefined {
    if (eof()) return undefined;

    const token = peek();

    // Function declaration
    if (token.type === "KEYWORD" && token.value === "fn") {
      return parseFnDecl();
    }

    // Let binding
    if (token.type === "KEYWORD" && token.value === "let") {
      return parseLetDecl();
    }

    // If statement
    if (token.type === "KEYWORD" && token.value === "if") {
      return parseIfStmt();
    }

    // While statement
    if (token.type === "KEYWORD" && token.value === "while") {
      return parseWhileStmt();
    }

    // Expression statement
    const expr = parseExpression();
    if (peek().type === "SEMI") {
      advance();
      return expr;
    }

    // Last expression in block (no semicolon)
    return expr;
  }

  function parseLetDecl(): ASTNode {
    expect("KEYWORD", "let");
    const nameToken = expect("IDENT");

    // Skip optional type annotation: let x : Type = expr
    // For MVP, skip anything between name and EQ
    while (!eof() && peek().type !== "EQ") {
      checkParseLoop();
      advance();
    }

    if (!eof()) {
      advance(); // consume =
    }

    const value = parseExpression();
    expect("SEMI", ";");
    return { kind: "Let", name: nameToken.value, value };
  }

  function parseFnDecl(): ASTNode {
    expect("KEYWORD", "fn");
    const nameToken = expect("IDENT");
    expect("LPAREN", "(");

    const params: string[] = [];
    if (peek().type !== "RPAREN") {
      // Skip type annotations: fn foo(a : I32, b : I32) => ...
      const paramToken = expect("IDENT");
      params.push(paramToken.value);
      // Skip optional type annotation
      while (!eof() && peek().type !== "COMMA" && peek().type !== "RPAREN") {
        checkParseLoop();
        advance();
      }
      while (peek().type === "COMMA") {
        checkParseLoop();
        advance();
        if (peek().type !== "RPAREN") {
          const p = expect("IDENT");
          params.push(p.value);
          // Skip optional type annotation
          while (!eof() && peek().type !== "COMMA" && peek().type !== "RPAREN") {
            checkParseLoop();
            advance();
          }
        }
      }
    }
    expect("RPAREN", ")");

    let body: ASTNode;

    // Arrow body: fn foo(a, b) => expr
    if (peek().type === "ARROW") {
      advance(); // consume =>
      body = parseExpression();
      expect("SEMI", ";");
    }
    // Block body: fn foo(a, b) { ... }
    else if (peek().type === "LBRACE") {
      body = parseBlock();
    }
    else {
      throw new Error(`Expected '=>' or '{' for function body at line ${peek().line}:${peek().col}`);
    }

    return { kind: "Fn", name: nameToken.value, params, body };
  }

  function parseIfStmt(): ASTNode {
    expect("KEYWORD", "if");
    expect("LPAREN", "(");
    const cond = parseExpression();
    expect("RPAREN", ")");

    expect("LBRACE", "{");
    const thenBody = parseBlockBody();
    let elseBody: ASTNode[] = [];

    if (!eof() && peek().type === "KEYWORD" && peek().value === "else") {
      advance(); // consume else
      expect("LBRACE", "{");
      elseBody = parseBlockBody();
    }

    return { kind: "If", cond, thenBody, elseBody };
  }

  function parseWhileStmt(): ASTNode {
    expect("KEYWORD", "while");
    expect("LPAREN", "(");
    const cond = parseExpression();
    expect("RPAREN", ")");

    expect("LBRACE", "{");
    const body = parseBlockBody();
    return { kind: "While", cond, body };
  }

  function parseBlock(): ASTNode {
    expect("LBRACE", "{");
    const body = parseBlockBody();
    return { kind: "Block", body };
  }

  function parseBlockBody(): ASTNode[] {
    const body: ASTNode[] = [];
    while (!eof() && peek().type !== "RBRACE") {
      checkParseLoop();
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    expect("RBRACE", "}");
    return body;
  }

  // ---- Program ----

  function parseProgram(): ASTNode {
    const body: ASTNode[] = [];
    while (!eof()) {
      checkParseLoop();
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    return { kind: "Program", body };
  }

  return parseProgram();
}

// ---- Code Generator ----

export function generate(ast: ASTNode): string {
  let indent = 0;

  function indentStr(): string {
    return "  ".repeat(indent);
  }

  function emit(node: ASTNode, isExpression: boolean = false): string {
    switch (node.kind) {
      case "Program": {
        return node.body
          .map((stmt) => {
            if (stmt.kind === "Fn") return emit(stmt);
            return indentStr() + emit(stmt) + ";";
          })
          .join("\n");
      }

      case "Let":
        return `${indentStr()}let ${node.name} = ${emit(node.value, true)};`;

      case "Fn": {
        const params = node.params.join(", ");
        if (node.body.kind === "Block") {
          return `${indentStr()}function ${node.name}(${params}) {\n${emit(node.body)}\n${indentStr()}}`;
        }
        return `${indentStr()}function ${node.name}(${params}) { return ${emit(node.body, true)}; }`;
      }

      case "If": {
        const thenCode = node.thenBody
          .map((stmt) => {
            if (stmt.kind === "Fn") return emit(stmt);
            return indentStr() + "  " + emit(stmt) + ";";
          })
          .join("\n");

        const elseCode = node.elseBody.length > 0
          ? "\n" + indentStr() + "else {\n" +
            node.elseBody
              .map((stmt) => indentStr() + "  " + emit(stmt) + ";")
              .join("\n") +
            "\n" + indentStr() + "}"
          : "";

        return `${indentStr()}if (${emit(node.cond, true)}) {\n${thenCode}\n${indentStr()}}${elseCode}`;
      }

      case "While": {
        const bodyCode = node.body
          .map((stmt) => indentStr() + "  " + emit(stmt) + ";")
          .join("\n");
        return `${indentStr()}while (${emit(node.cond, true)}) {\n${bodyCode}\n${indentStr()}}`;
      }

      case "Block": {
        indent++;
        const lines = node.body.map((stmt) => {
          if (stmt.kind === "Fn") return emit(stmt);
          return indentStr() + emit(stmt) + ";";
        });
        indent--;
        return lines.join("\n");
      }

      case "Binary":
        return `${emit(node.left, true)} ${node.op} ${emit(node.right, true)}`;

      case "Unary":
        return `${node.op}${emit(node.operand, true)}`;

      case "Call": {
        const args = node.args.map((arg) => emit(arg, true)).join(", ");
        return `${emit(node.callee, true)}(${args})`;
      }

      case "Index":
        return `${emit(node.obj, true)}[${emit(node.index, true)}]`;

      case "Property":
        return `${emit(node.obj, true)}.${node.prop}`;

      case "ArrayLit": {
        const elements = node.elements.map((el) => emit(el, true)).join(", ");
        return `[${elements}]`;
      }

      case "ObjectLit": {
        const props = node.properties
          .map((p) => `${p.key}: ${emit(p.value, true)}`)
          .join(", ");
        return `{ ${props} }`;
      }

      case "Ident":
        return node.name;

      case "Number":
        return String(node.value);

      case "String":
        return `"${node.value}"`;

      case "Bool":
        return node.value ? "true" : "false";
    }
  }

  return emit(ast);
}

// ---- Public API ----

export function compile(source: string): string {
  const tokens = lex(source);
  const ast = parse(tokens);
  return generate(ast);
}

// ---- CLI ----

if (import.meta.main) {
  const args = process.argv;
  const inputFile = args[2];

  if (!inputFile) {
    console.error("Usage: tuff compile <input.tuff>");
    process.exit(1);
  }

  try {
    const fs = require("fs");
    const source = fs.readFileSync(inputFile, "utf-8");
    const output = compile(source);
    console.log(output);
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
