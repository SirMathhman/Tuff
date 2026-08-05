// ── AST Node Types ────────────────────────────────────────────────

type AstNode = Literal | BinaryExpression;

interface Literal {
  type: "Literal";
  value: number;
}

interface BinaryExpression {
  type: "BinaryExpression";
  operator: "+" | "-" | "*" | "/";
  left: AstNode;
  right: AstNode;
}

// ── Tokenizer ─────────────────────────────────────────────────────

type Token =
  | { kind: "number"; value: number }
  | { kind: "operator"; operator: "+" | "-" | "*" | "/" };

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  for (const match of s.matchAll(/(\d+|[+\-*/])/g)) {
    const t = match[1]!;
    if (/^\d+$/.test(t)) {
      tokens.push({ kind: "number", value: parseInt(t, 10) });
    } else {
      tokens.push({ kind: "operator", operator: t as "+" | "-" | "*" | "/" });
    }
  }
  return tokens;
}

// ── Parser (recursive descent, * / before + -) ───────────────────

function parse(tokens: Token[]): AstNode {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++]!;
  }

  // expression → term (( "+" | "-" ) term)*
  function parseExpression(): AstNode {
    let left = parseTerm();
    while (
      peek()?.kind === "operator" &&
      ["+", "-"].includes(
        (peek()! as Extract<Token, { kind: "operator" }>).operator,
      )
    ) {
      const opToken = consume() as Extract<Token, { kind: "operator" }>;
      left = {
        type: "BinaryExpression",
        operator: opToken.operator,
        left,
        right: parseTerm(),
      };
    }
    return left;
  }

  // term → literal (("*" | "/") literal)*
  function parseTerm(): AstNode {
    let left = consumeLiteral();
    while (
      peek()?.kind === "operator" &&
      ["*", "/"].includes((peek()! as any).operator)
    ) {
      const opToken = consume() as Extract<Token, { kind: "operator" }>;
      left = {
        type: "BinaryExpression",
        operator: opToken.operator,
        left,
        right: consumeLiteral(),
      };
    }
    return left;
  }

  function consumeLiteral(): AstNode {
    const t = consume();
    if (t.kind !== "number") throw new Error("Expected number");
    return { type: "Literal", value: t.value };
  }

  return parseExpression();
}

// ── Evaluator ─────────────────────────────────────────────────────

function evalNode(node: AstNode): number {
  if (node.type === "Literal") return node.value;
  const left = evalNode(node.left);
  const right = evalNode(node.right);
  switch (node.operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
  }
}

// ── Block & Parentheses Resolution ────────────────────────────────

function resolveBlocks(s: string): string {
  while (s.includes("{")) {
    const m = s.match(/\{([^{}]+)\}/);
    if (!m) break;
    s = s.replace(m[0]!, String(evaluate(m[1]!)));
  }
  return s;
}

function resolveParens(s: string): string {
  while (s.includes("(")) {
    const m = s.match(/\(([^()]+)\)/);
    if (!m) break;
    const inner = m[1]!;
    if (/;\b|^\s*let\b/.test(inner)) {
      throw new Error("Statements not allowed in parentheses");
    }
    s = s.replace(m[0]!, String(evaluate(inner)));
  }
  return s;
}

// ── Public API ────────────────────────────────────────────────────

export function evaluate(source: string): number {
  let s = source.trim();
  if (!s) return 0;

  // Statement-only input (trailing ";" with no expression after it) → 0
  const lastSemicolon = s.lastIndexOf(";");
  if (lastSemicolon !== -1 && !s.slice(lastSemicolon + 1).trim()) {
    return 0;
  }

  // Pre-process: resolve blocks and parentheses first
  s = resolveBlocks(s);
  s = resolveParens(s);

  // Parse → AST, then evaluate the tree
  const tokens = tokenize(s);
  if (tokens.length === 0) return 0;
  const ast = parse(tokens);
  return evalNode(ast);
}
