// --- AST Node Types (Phase 1) ---
type AstNode =
  | { type: 'number'; value: number }
  | { type: 'binary_op'; op: '+' | '-' | '*' | '/'; left: AstNode; right: AstNode };

// --- Tokenizer (unchanged) ---
type Token =
  | { type: 'number'; value: number }
  | { type: 'plus' }
  | { type: 'minus' }
  | { type: 'multiply' }
  | { type: 'divide' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'lbrace' }
  | { type: 'rbrace' };

function isNumberToken(token: Token): token is Extract<Token, { type: 'number' }> {
  return token.type === 'number';
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === ' ') {
      i++;
    } else if (ch >= '0' && ch <= '9') {
      let numStr = '';
      while (i < source.length && source[i]! >= '0' && source[i]! <= '9') {
        numStr += source[i]!;
        i++;
      }
      tokens.push({ type: 'number', value: Number(numStr) });
    } else if (ch === '+') {
      tokens.push({ type: 'plus' });
      i++;
    } else if (ch === '-') {
      tokens.push({ type: 'minus' });
      i++;
    } else if (ch === '*') {
      tokens.push({ type: 'multiply' });
      i++;
    } else if (ch === '/') {
      tokens.push({ type: 'divide' });
      i++;
    } else if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
    } else if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
    } else if (ch === '{') {
      tokens.push({ type: 'lbrace' });
      i++;
    } else if (ch === '}') {
      tokens.push({ type: 'rbrace' });
      i++;
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
  }
  return tokens;
}

// --- Parser: builds AST from tokens (Phase 2) ---
type ParseResult = { ast: AstNode; pos: number };

// parseFactor: handles numbers and parenthesized expressions (highest precedence)
function parseFactor(tokens: Token[], pos: number): ParseResult {
  const token = tokens[pos]!;

  // Handle grouped expression: recursively parse inside parens or braces
  if (token.type === 'lparen' || token.type === 'lbrace') {
    const innerResult = parseExpression(tokens, pos + 1);
    return { ast: innerResult.ast, pos: innerResult.pos + 1 };
  }

  if (!isNumberToken(token)) {
    throw new Error(`Unexpected token at position ${pos}`);
  }
  return { ast: { type: 'number', value: token.value }, pos: pos + 1 };
}

// parseTerm: handles * and / (higher precedence than +/-)
function parseTerm(tokens: Token[], pos: number): ParseResult {
  let left = parseFactor(tokens, pos);

  while (
    left.pos < tokens.length &&
    (tokens[left.pos]?.type === 'multiply' || tokens[left.pos]?.type === 'divide')
  ) {
    const opToken = tokens[left.pos]!;
    const op: '*' | '/' = opToken.type === 'multiply' ? '*' : '/';
    left.pos++;
    const right = parseFactor(tokens, left.pos);
    left.ast = { type: 'binary_op', op, left: left.ast, right: right.ast };
    left.pos = right.pos;
  }

  return left;
}

// parseExpression: handles + and - (lowest precedence)
function parseExpression(tokens: Token[], pos: number): ParseResult {
  let result = parseTerm(tokens, pos);

  while (
    result.pos < tokens.length &&
    (tokens[result.pos]?.type === 'plus' || tokens[result.pos]?.type === 'minus')
  ) {
    const opToken = tokens[result.pos]!;
    const op: '+' | '-' = opToken.type === 'plus' ? '+' : '-';
    result.pos++;
    const right = parseTerm(tokens, result.pos);
    result.ast = { type: 'binary_op', op, left: result.ast, right: right.ast };
    result.pos = right.pos;
  }

  return result;
}

// --- Evaluator: walks AST to produce a number (Phase 3) ---
function evalAst(node: AstNode): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'binary_op': {
      const left = evalAst(node.left);
      const right = evalAst(node.right);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return Math.trunc(left / right); // integer division
      }
    }
  }
}

// --- Entry Point (Phase 4: wire up Tokenize → Parse → Evaluate) ---
export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed.length === 0) return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  const parsed = parseExpression(tokens, 0); // returns AstNode + pos
  return evalAst(parsed.ast);                // walks tree → number
}
