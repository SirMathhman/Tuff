// --- AST Node Types (Phase 1) ---
type AstNode =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | {
      type: "binary_op";
      op: "+" | "-" | "*" | "/";
      left: AstNode;
      right: AstNode;
    }
  | { type: "let"; name: string; init: AstNode }
  | { type: "block"; statements: AstNode[] };

// --- Tokenizer (unchanged) ---
type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "let_keyword" }
  | { type: "assign" } // =
  | { type: "semicolon" } // ;
  | { type: "plus" }
  | { type: "minus" }
  | { type: "multiply" }
  | { type: "divide" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" };

function isNumberToken(
  token: Token,
): token is Extract<Token, { type: "number" }> {
  return token.type === "number";
}

function isIdentifierToken(
  token: Token,
): token is Extract<Token, { type: "identifier" }> {
  return token.type === "identifier";
}

// Keywords that look like identifiers but are reserved
const KEYWORDS = new Set(["let"]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " ") {
      i++;
    } else if (ch >= "0" && ch <= "9") {
      let numStr = "";
      while (i < source.length && source[i]! >= "0" && source[i]! <= "9") {
        numStr += source[i]!;
        i++;
      }
      tokens.push({ type: "number", value: Number(numStr) });
    } else if (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_"
    ) {
      let name = "";
      while (
        i < source.length &&
        ((source[i]! >= "a" && source[i]! <= "z") ||
          (source[i]! >= "A" && source[i]! <= "Z") ||
          (source[i]! >= "0" && source[i]! <= "9") ||
          source[i] === "_")
      ) {
        name += source[i]!;
        i++;
      }
      if (KEYWORDS.has(name)) {
        if (name === "let") {
          tokens.push({ type: "let_keyword" as const });
        }
      } else {
        tokens.push({ type: "identifier", name });
      }
    } else if (ch === "+") {
      tokens.push({ type: "plus" });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "minus" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "multiply" });
      i++;
    } else if (ch === "/") {
      tokens.push({ type: "divide" });
      i++;
    } else if (ch === "=") {
      tokens.push({ type: "assign" });
      i++;
    } else if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
    } else if (ch === "{") {
      tokens.push({ type: "lbrace" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "rbrace" });
      i++;
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
  }
  return tokens;
}

// --- Parser: builds AST from tokens (Phase 2) ---
type ParseResult = { ast: AstNode; pos: number };

// parseFactor: handles numbers, identifiers, and grouped expressions (highest precedence)
function parseFactor(tokens: Token[], pos: number): ParseResult {
  const token = tokens[pos]!;

  // Handle identifier reference (variable lookup)
  if (isIdentifierToken(token)) {
    return { ast: { type: "identifier", name: token.name }, pos: pos + 1 };
  }

  // Handle grouped expression: recursively parse inside parens or braces
  if (token.type === "lparen") {
    const innerResult = parseExpression(tokens, pos + 1);
    return { ast: innerResult.ast, pos: innerResult.pos + 1 };
  }

  // Handle block with statements: let declarations and expressions separated by ;
  if (token.type === "lbrace") {
    const result = parseBlock(tokens, pos + 1);
    return { ast: result.ast, pos: result.pos };
  }

  if (!isNumberToken(token)) {
    throw new Error(`Unexpected token at position ${pos}`);
  }
  return { ast: { type: "number", value: token.value }, pos: pos + 1 };
}

// parseStatement: parses a single statement (let declaration or expression) and advances position
type StatementParseResult = { ast: AstNode; pos: number };
function parseStatement(tokens: Token[], index: number): StatementParseResult {
  const token = tokens[index]!;

  // Parse "let x = expr;"
  if (token.type === "let_keyword") {
    let i = index + 1; // skip 'let'
    const nameToken = tokens[i];
    if (!nameToken || !isIdentifierToken(nameToken)) {
      throw new Error(`Expected identifier after 'let' at position ${i}`);
    }
    const name = nameToken.name;
    i++; // skip identifier
    const assignToken = tokens[i];
    if (!assignToken || assignToken.type !== "assign") {
      throw new Error(`Expected '=' after variable name at position ${i}`);
    }
    i++; // skip '='
    const initResult = parseExpression(tokens, i);
    return {
      ast: { type: "let", name, init: initResult.ast },
      pos: initResult.pos,
    };
  }

  // Parse expression statement: "expr;"
  const exprResult = parseExpression(tokens, index);
  return { ast: exprResult.ast, pos: exprResult.pos };
}

// skipSemicolon: consumes optional trailing semicolon
function skipSemicolon(tokens: Token[], index: number): number {
  if (index < tokens.length && tokens[index]!.type === "semicolon") {
    return index + 1;
  }
  return index;
}

// parseBlock: parses statements inside { ... } returning a block AST node
type BlockParseResult = { ast: AstNode; pos: number };
function parseBlock(tokens: Token[], pos: number): BlockParseResult {
  let index = pos;
  const statements: AstNode[] = [];

  while (index < tokens.length && tokens[index]!.type !== "rbrace") {
    const stmt = parseStatement(tokens, index);
    statements.push(stmt.ast);
    index = skipSemicolon(tokens, stmt.pos);
  }

  // Skip closing brace
  return { ast: { type: "block", statements }, pos: index + 1 };
}

// parseTerm: handles * and / (higher precedence than +/-)
function parseTerm(tokens: Token[], pos: number): ParseResult {
  let left = parseFactor(tokens, pos);

  while (
    left.pos < tokens.length &&
    (tokens[left.pos]?.type === "multiply" ||
      tokens[left.pos]?.type === "divide")
  ) {
    const opToken = tokens[left.pos]!;
    const op: "*" | "/" = opToken.type === "multiply" ? "*" : "/";
    left.pos++;
    const right = parseFactor(tokens, left.pos);
    left.ast = { type: "binary_op", op, left: left.ast, right: right.ast };
    left.pos = right.pos;
  }

  return left;
}

// parseExpression: handles + and - (lowest precedence)
function parseExpression(tokens: Token[], pos: number): ParseResult {
  let result = parseTerm(tokens, pos);

  while (
    result.pos < tokens.length &&
    (tokens[result.pos]?.type === "plus" ||
      tokens[result.pos]?.type === "minus")
  ) {
    const opToken = tokens[result.pos]!;
    const op: "+" | "-" = opToken.type === "plus" ? "+" : "-";
    result.pos++;
    const right = parseTerm(tokens, result.pos);
    result.ast = { type: "binary_op", op, left: result.ast, right: right.ast };
    result.pos = right.pos;
  }

  return result;
}

// --- Evaluator: walks AST to produce a number (Phase 3) ---
type Scope = Map<string, number>;

function evalAst(node: AstNode, scope: Scope): number {
  switch (node.type) {
    case "block": {
      let lastValue = 0;
      for (const stmt of node.statements) {
        lastValue = evalAst(stmt, scope);
      }
      return lastValue;
    }
    case "number":
      return node.value;
    case "identifier": {
      const value = scope.get(node.name);
      if (value === undefined) {
        throw new Error(`Undefined variable '${node.name}'`);
      }
      return value;
    }
    case "binary_op": {
      const left = evalAst(node.left, scope);
      const right = evalAst(node.right, scope);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return Math.trunc(left / right); // integer division
      }
    }
    case "let": {
      const value = evalAst(node.init, scope);
      scope.set(node.name, value);
      return value;
    }
  }
}

// --- Program Parser: top-level statement sequence (let decls + expressions) ---
type ProgramParseResult = { ast: AstNode; pos: number };
function parseProgram(tokens: Token[], pos: number): ProgramParseResult {
  let index = pos;
  const statements: AstNode[] = [];

  while (index < tokens.length) {
    const stmt = parseStatement(tokens, index);
    statements.push(stmt.ast);
    index = skipSemicolon(tokens, stmt.pos);
  }

  return { ast: { type: "block", statements }, pos };
}

// --- Entry Point (Phase 4: wire up Tokenize → Parse → Evaluate) ---
export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed.length === 0) return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  const parsed = parseProgram(tokens, 0); // returns block AST with all statements
  const scope: Scope = new Map();
  return evalAst(parsed.ast, scope); // walks tree → number with variable scope
}
