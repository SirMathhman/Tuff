// --- AST Node Types (Phase 1) ---
interface NumberLiteral {
  type: "number";
  value: number;
}

interface Identifier {
  type: "identifier";
  name: string;
}

interface BinaryOp {
  type: "binary_op";
  op: "+" | "-" | "*" | "/" | "||" | "&&";
  left: AstNode;
  right: AstNode;
}

interface LetDeclaration {
  type: "let";
  name: string;
  mutable: boolean;
  init: AstNode;
}

interface AssignExpr {
  type: "assign_expr";
  name: string;
  value: AstNode;
}

interface Block {
  type: "block";
  statements: AstNode[];
}

interface BoolLiteral {
  type: "bool";
  value: boolean;
}

type AstNode =
  | NumberLiteral
  | Identifier
  | BinaryOp
  | LetDeclaration
  | AssignExpr
  | Block
  | BoolLiteral;

// --- Tokenizer (unchanged) ---
interface NumberToken {
  type: "number";
  value: number;
}

interface IdentifierToken {
  type: "identifier";
  name: string;
}

interface LetKeyword {
  type: "let_keyword";
}

interface MutKeyword {
  type: "mut_keyword";
}

interface AssignToken {
  type: "assign";
}

interface SemicolonToken {
  type: "semicolon";
}

interface PlusToken {
  type: "plus";
}

interface MinusToken {
  type: "minus";
}

interface MultiplyToken {
  type: "multiply";
}

interface DivideToken {
  type: "divide";
}

interface LParenToken {
  type: "lparen";
}

interface RParenToken {
  type: "rparen";
}

interface LBraceToken {
  type: "lbrace";
}

interface RBraceToken {
  type: "rbrace";
}

interface TrueKeyword {
  type: "true_keyword";
}

interface FalseKeyword {
  type: "false_keyword";
}

interface AndToken {
  type: "and";
}

interface OrToken {
  type: "or";
}

type Token =
  | NumberToken
  | IdentifierToken
  | LetKeyword
  | MutKeyword
  | TrueKeyword
  | FalseKeyword
  | AssignToken
  | SemicolonToken
  | AndToken
  | OrToken
  | PlusToken
  | MinusToken
  | MultiplyToken
  | DivideToken
  | LParenToken
  | RParenToken
  | LBraceToken
  | RBraceToken;

function isNumberToken(token: Token): token is NumberToken {
  return token.type === "number";
}

function isIdentifierToken(token: Token): token is IdentifierToken {
  return token.type === "identifier";
}

// Keywords that look like identifiers but are reserved
const KEYWORDS = new Set(["let", "mut", "true", "false"]);

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
        } else if (name === "true") {
          tokens.push({ type: "true_keyword" as const });
        } else if (name === "false") {
          tokens.push({ type: "false_keyword" as const });
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
    } else if (ch === "&") {
      if (i + 1 < source.length && source[i + 1] === "&") {
        tokens.push({ type: "and" });
        i += 2;
      } else {
        throw new Error(`Unexpected character '&' at position ${i}`);
      }
    } else if (ch === "|") {
      if (i + 1 < source.length && source[i + 1] === "|") {
        tokens.push({ type: "or" });
        i += 2;
      } else {
        throw new Error(`Unexpected character '|' at position ${i}`);
      }
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
interface ParseResult {
  ast: AstNode;
  pos: number;
}

// parseAssignmentExpr: handles identifier assignment (lowest precedence) — declared before use by parseStatement
function parseAssignmentExpr(tokens: Token[], pos: number): ParseResult {
  const exprResult = parseBinaryOp(tokens, pos, 1);

  // Check if this is an assignment: "identifier = expr"
  if (
    exprResult.ast.type === "identifier" &&
    exprResult.pos < tokens.length &&
    tokens[exprResult.pos]?.type === "assign"
  ) {
    const name = (exprResult.ast as Identifier).name;
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

  // Handle boolean literals
  if (token.type === "true_keyword") {
    return { ast: { type: "bool", value: true }, pos: pos + 1 };
  }
  if (token.type === "false_keyword") {
    return { ast: { type: "bool", value: false }, pos: pos + 1 };
  }

  // Handle grouped expression: recursively parse inside parens or braces
  if (token.type === "lparen") {
    const innerResult = parseBinaryOp(tokens, pos + 1, 1);
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
interface StatementParseResult {
  ast: AstNode;
  pos: number;
}
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
interface BlockParseResult {
  ast: AstNode;
  pos: number;
}
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

// Precedence table for binary operators (higher = tighter binding)
function getBinaryOpPrecedence(token: Token): number {
  switch (token.type) {
    case "or":
      return 1;
    case "and":
      return 2;
    case "plus":
    case "minus":
      return 2;
    case "multiply":
    case "divide":
      return 3;
    default:
      return 0;
  }
}

// Maps a token type to its operator string for AST node creation
function tokenTypeToBinaryOp(token: Token): BinaryOp["op"] {
  switch (token.type) {
    case "plus":
      return "+";
    case "minus":
      return "-";
    case "multiply":
      return "*";
    case "divide":
      return "/";
    case "or":
      return "||";
    case "and":
      return "&&";
    default:
      throw new Error(`Unexpected token type for binary op`);
  }
}

// parseBinaryOp: generic precedence-climbing parser for all binary operators
function parseBinaryOp(
  tokens: Token[],
  pos: number,
  minPrec: number,
): ParseResult {
  const left = parseFactor(tokens, pos);

  while (left.pos < tokens.length) {
    const prec = getBinaryOpPrecedence(tokens[left.pos]!);
    if (prec < minPrec) break;

    const opToken = tokens[left.pos]!;
    const op = tokenTypeToBinaryOp(opToken);
    left.pos++;
    const right = parseBinaryOp(tokens, left.pos, prec + 1);
    left.ast = { type: "binary_op", op, left: left.ast, right: right.ast };
    left.pos = right.pos;
  }

  return left;
}

// --- Evaluator: walks AST with statement/expression distinction (Phase 5) ---
interface EvalValue {
  type: "value";
  value: number;
}

interface EvalVoid {
  type: "void";
}

type EvalResult = EvalValue | EvalVoid;

interface ScopeEntry {
  value: number;
  mutable: boolean;
}

interface ScopeFrame {
  locals: Map<string, ScopeEntry>;
  parent: ScopeFrame | null;
}

type Scope = ScopeFrame;

function findScopeFrame(name: string, scope: Scope): ScopeFrame {
  let frame: ScopeFrame | null = scope;
  while (frame) {
    if (frame.locals.has(name)) return frame;
    frame = frame.parent;
  }
  throw new Error(`Undefined variable '${name}'`);
}

function lookupScopeEntry(name: string, scope: Scope): ScopeEntry {
  return findScopeFrame(name, scope).locals.get(name)!;
}

function evalBinaryOp(node: BinaryOp, scope: Scope): EvalValue {
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
  let value: number;
  switch (node.op) {
    case "+":
      value = left + right;
      break;
    case "-":
      value = left - right;
      break;
    case "*":
      value = left * right;
      break;
    case "/":
      value = Math.trunc(left / right);
      break;
    case "||":
      value = left !== 0 || right !== 0 ? 1 : 0;
      break;
    case "&&":
      value = left !== 0 && right !== 0 ? 1 : 0;
      break;
  }
  return { type: "value", value };
}

function evalBlockStatements(statements: AstNode[], scope: Scope): EvalResult {
  // Create a new child scope frame for block scoping
  const childScope: Scope = { locals: new Map(), parent: scope };
  let lastValue = 0;
  for (const stmt of statements) {
    const result = evalAst(stmt, childScope);
    if (result.type === "value") {
      lastValue = result.value;
    }
  }
  // Child scope is discarded on exit — no cleanup needed
  return { type: "value", value: lastValue };
}

function evalAst(node: AstNode, scope: Scope): EvalResult {
  switch (node.type) {
    case "block":
      return evalBlockStatements(node.statements, scope);
    case "number":
      return { type: "value", value: node.value };
    case "bool":
      return { type: "value", value: node.value ? 1 : 0 };
    case "identifier": {
      const entry = lookupScopeEntry(node.name, scope);
      return { type: "value", value: entry.value };
    }
    case "binary_op":
      return evalBinaryOp(node, scope);
    case "let": {
      const initResult = evalAst(node.init, scope);
      if (initResult.type !== "value") {
        throw new Error(`Let declaration requires a value expression`);
      }
      // Allow shadowing — redeclaration is permitted
      scope.locals.set(node.name, {
        value: initResult.value,
        mutable: node.mutable,
      });
      return { type: "void" }; // declarations don't produce values
    }
    case "assign_expr": {
      const frame = findScopeFrame(node.name, scope);
      const entry = frame.locals.get(node.name)!;
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
interface ProgramParseResult {
  ast: AstNode;
  pos: number;
}
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
  const scope: Scope = { locals: new Map(), parent: null };
  const result = evalAst(parsed.ast, scope);
  return result.type === "value" ? result.value : 0;
}
