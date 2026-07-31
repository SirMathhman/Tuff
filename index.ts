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
  | { type: "let"; name: string; mutable: boolean; init: AstNode }
  | { type: "assign_expr"; name: string; value: AstNode }
  | { type: "block"; statements: AstNode[] };

// --- Tokenizer (unchanged) ---
type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "let_keyword" }
  | { type: "mut_keyword" }
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
const KEYWORDS = new Set(["let", "mut"]);

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
        } else if (name === "mut") {
          tokens.push({ type: "mut_keyword" as const });
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

// parseAssignmentExpr: handles identifier assignment (lowest precedence) — declared before use by parseStatement
function parseAssignmentExpr(tokens: Token[], pos: number): ParseResult {
  const exprResult = parseExpression(tokens, pos);

  // Check if this is an assignment: "identifier = expr"
  if (
    exprResult.ast.type === "identifier" &&
    exprResult.pos < tokens.length &&
    tokens[exprResult.pos]?.type === "assign"
  ) {
    const name = (exprResult.ast as { type: "identifier"; name: string }).name;
    const i = exprResult.pos + 1; // skip '='
    const valueResult = parseAssignmentExpr(tokens, i); // right-recursive for chained assignments
    return {
      ast: { type: "assign_expr", name, value: valueResult.ast },
      pos: valueResult.pos,
    };
  }

  return exprResult;
}

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

// parseStatement: parses a single statement (let declaration, assignment, or expression) and advances position
type StatementParseResult = { ast: AstNode; pos: number };
function parseStatement(tokens: Token[], index: number): StatementParseResult {
  const token = tokens[index]!;

  // Parse "let [mut] x = expr;"
  if (token.type === "let_keyword") {
    let i = index + 1; // skip 'let'

    // Check for optional 'mut' keyword
    const isMutable = tokens[i]?.type === "mut_keyword";
    if (isMutable) {
      i++; // skip 'mut'
    }

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
    const initResult = parseAssignmentExpr(tokens, i);
    return {
      ast: { type: "let", name, mutable: isMutable, init: initResult.ast },
      pos: initResult.pos,
    };
  }

  // Parse expression statement (may include assignment): "expr;"
  const exprResult = parseAssignmentExpr(tokens, index);
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
  const left = parseFactor(tokens, pos);

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
  const result = parseTerm(tokens, pos);

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

// --- Evaluator: walks AST with statement/expression distinction (Phase 5) ---
type EvalResult =
  | { type: "value"; value: number } // Expressions produce values
  | { type: "void" }; // Statements produce no value

type ScopeEntry = { value: number; mutable: boolean };
type Scope = Map<string, ScopeEntry>;

function lookupScopeEntry(name: string, scope: Scope): ScopeEntry {
  const entry = scope.get(name);
  if (entry === undefined) {
    throw new Error(`Undefined variable '${name}'`);
  }
  return entry;
}

function evalAst(node: AstNode, scope: Scope): EvalResult {
  switch (node.type) {
    case "block": {
      let lastValue = 0;
      for (const stmt of node.statements) {
        const result = evalAst(stmt, scope);
        if (result.type === "value") {
          lastValue = result.value;
        }
      }
      return { type: "value", value: lastValue };
    }
    case "number":
      return { type: "value", value: node.value };
    case "identifier": {
      const entry = lookupScopeEntry(node.name, scope);
      return { type: "value", value: entry.value };
    }
    case "binary_op": {
      const leftResult = evalAst(node.left, scope);
      const rightResult = evalAst(node.right, scope);

      // Both operands must be values for binary operations
      if (leftResult.type !== "value" || rightResult.type !== "value") {
        throw new Error(
          `Binary operation requires value expressions on both sides`,
        );
      }

      const left = leftResult.value;
      const right = rightResult.value;
      switch (node.op) {
        case "+":
          return { type: "value", value: left + right };
        case "-":
          return { type: "value", value: left - right };
        case "*":
          return { type: "value", value: left * right };
        case "/":
          return { type: "value", value: Math.trunc(left / right) };
      }
    }
    case "let": {
      const initResult = evalAst(node.init, scope);
      if (initResult.type !== "value") {
        throw new Error(`Let declaration requires a value expression`);
      }
      // Allow shadowing — redeclaration is permitted
      scope.set(node.name, { value: initResult.value, mutable: node.mutable });
      return { type: "void" }; // declarations don't produce values
    }
    case "assign_expr": {
      const entry = lookupScopeEntry(node.name, scope);
      if (!entry.mutable) {
        throw new Error(`Cannot assign to immutable variable '${node.name}'`);
      }
      const valueResult = evalAst(node.value, scope);
      if (valueResult.type !== "value") {
        throw new Error(`Assignment requires a value expression`);
      }
      entry.value = valueResult.value;
      return { type: "void" }; // assignments don't produce values
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
  const result = evalAst(parsed.ast, scope);
  return result.type === "value" ? result.value : 0;
}
