// Tokenizer
type TokenType =
  | "number"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "lparen"
  | "rparen"
  | "eof";

interface Token {
  type: TokenType;
  value: number;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;

    if (char === " ") {
      i++;
      continue;
    }

    if (char >= "0" && char <= "9") {
      let start = i;
      while (i < source.length && source[i]! >= "0" && source[i]! <= "9") {
        i++;
      }
      tokens.push({ type: "number", value: Number(source.slice(start, i)) });
      continue;
    }

    switch (char) {
      case "+":
        tokens.push({ type: "plus", value: 0 });
        break;
      case "-":
        tokens.push({ type: "minus", value: 0 });
        break;
      case "*":
        tokens.push({ type: "star", value: 0 });
        break;
      case "/":
        tokens.push({ type: "slash", value: 0 });
        break;
      case "(":
        tokens.push({ type: "lparen", value: 0 });
        break;
      case ")":
        tokens.push({ type: "rparen", value: 0 });
        break;
      default:
        throw new Error(`Unexpected character: ${char}`);
    }
    i++;
  }

  tokens.push({ type: "eof", value: 0 });
  return tokens;
}

// Parser (recursive descent)
type ASTNode =
  | { type: "number"; value: number }
  | { type: "binary"; operator: TokenType; left: ASTNode; right: ASTNode };

class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode {
    if (this.peek().type === "eof") {
      return { type: "number", value: 0 };
    }
    return this.parseExpression();
  }

  private parseExpression(): ASTNode {
    let left = this.parseTerm();

    while (this.match("plus") || this.match("minus")) {
      const operator = this.previous().type;
      const right = this.parseTerm();
      left = { type: "binary", operator, left, right };
    }

    return left;
  }

  private parseTerm(): ASTNode {
    let left = this.parseFactor();

    while (this.match("star") || this.match("slash")) {
      const operator = this.previous().type;
      const right = this.parseFactor();
      left = { type: "binary", operator, left, right };
    }

    return left;
  }

  private parseFactor(): ASTNode {
    if (this.match("number")) {
      return { type: "number", value: this.previous().value };
    }

    if (this.match("lparen")) {
      const expr = this.parseExpression();
      this.consume("rparen", "Expected ')' after expression");
      return expr;
    }

    throw new Error("Expected a number or '('");
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new Error(message);
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.check("eof")) {
      this.current++;
    }
    return this.previous();
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }
}

// Evaluator
function evaluateAST(node: ASTNode): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "binary":
      switch (node.operator) {
        case "plus":
          return evaluateAST(node.left) + evaluateAST(node.right);
        case "minus":
          return evaluateAST(node.left) - evaluateAST(node.right);
        case "star":
          return evaluateAST(node.left) * evaluateAST(node.right);
        case "slash":
          return evaluateAST(node.left) / evaluateAST(node.right);
        default:
          throw new Error(`Unknown operator: ${node.operator}`);
      }
  }
}

export function evaluate(source: string): number {
  const tokens = tokenize(source);
  const ast = new Parser(tokens).parse();
  return evaluateAST(ast);
}
