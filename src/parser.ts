import type { Token, AST, TypeName, Param, IntegerTypeName } from "./types";

const TYPE_NAMES: TypeName[] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64", "Bool"];

export class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): AST {
    const statements = this.parseStatements(false);
    return { type: "block", statements };
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    if (!token) {
      throw new Error("Unexpected end of input");
    }
    this.index++;
    return token;
  }

  private parseAdditive(): AST {
    let left = this.parseLogicalOr();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && (token.value === "+" || token.value === "-")) {
        this.consume();
        const right = this.parseLogicalOr();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseLogicalOr(): AST {
    let left = this.parseLogicalAnd();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && token.value === "||") {
        this.consume();
        const right = this.parseLogicalAnd();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseLogicalAnd(): AST {
    let left = this.parseComparison();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && token.value === "&&") {
        this.consume();
        const right = this.parseComparison();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseComparison(): AST {
    let left = this.parseAssignment();

    while (true) {
      const token = this.peek();
      if (
        token &&
        token.type === "operator" &&
        (token.value === "<" || token.value === ">" || token.value === "<=" || token.value === ">=" || token.value === "==" || token.value === "!=")
      ) {
        this.consume();
        const right = this.parseAssignment();
        left = { type: "binary", operator: token.value, left, right };
      } else if (token && token.type === "operator" && token.value === "is") {
        this.consume();
        const typeName = this.parseType("Expected type name after is");
        left = { type: "binary", operator: "is", left, right: { type: "typeRef", name: typeName } };
      } else {
        break;
      }
    }

    return left;
  }

  private parseAssignment(): AST {
    const left = this.parseMultiplicative();
    const token = this.peek();
    if (
      token &&
      token.type === "operator" &&
      (token.value === "=" || token.value === "+=" || token.value === "-=" || token.value === "*=" || token.value === "/=")
    ) {
      this.consume();
      const value = this.parseAssignment();
      if (left.type === "identifier") {
        return { type: "assign", name: left.name, operator: token.value, value };
      }
      if (left.type === "index") {
        return { type: "indexAssign", target: left.target, index: left.index, operator: token.value, value };
      }
      throw new Error(`Invalid assignment target: ${JSON.stringify(left)}`);
    }
    return left;
  }

  private parseMultiplicative(): AST {
    let left = this.parsePrimary();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        this.consume();
        const right = this.parsePrimary();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parsePrimary(): AST {
    const token = this.consume();
    let node: AST;
    if (token.type === "number") {
      node = { type: "number", value: token.value, typeName: token.typeName as IntegerTypeName | undefined };
    } else if (token.type === "boolean") {
      node = { type: "boolean", value: token.value };
    } else if (token.type === "identifier" && token.value === "if") {
      node = this.parseIf();
    } else if (token.type === "identifier" && token.value === "while") {
      node = this.parseWhile();
    } else if (token.type === "identifier") {
      const name = token.value;
      if (this.peek() && this.peek()!.type === "paren" && this.peek()!.value === "(") {
        node = this.parseCall(name);
      } else {
        node = { type: "identifier", name };
      }
    } else if (token.type === "operator" && token.value === "-") {
      node = { type: "unary", operator: "-", operand: this.parsePrimary() };
    } else if (token.type === "operator" && token.value === "!") {
      node = { type: "unary", operator: "!", operand: this.parsePrimary() };
    } else if (token.type === "paren" && token.value === "{") {
      node = this.parseBlock();
    } else if (token.type === "paren" && token.value === "(") {
      const inner = this.parseAdditive();
      const closing = this.consume();
      if (closing.type !== "paren" || closing.value !== ")") {
        throw new Error(`Expected closing paren, got: ${JSON.stringify(closing)}`);
      }
      node = inner;
    } else if (token.type === "bracket" && token.value === "[") {
      node = this.parseArrayLiteral();
    } else {
      throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
    }
    return this.parsePostfix(node);
  }

  private parsePostfix(node: AST): AST {
    while (true) {
      const next = this.peek();
      if (next && next.type === "bracket" && next.value === "[") {
        this.consume();
        const index = this.parseAdditive();
        const closing = this.consume();
        if (closing.type !== "bracket" || closing.value !== "]") {
          throw new Error(`Expected ], got: ${JSON.stringify(closing)}`);
        }
        node = { type: "index", target: node, index };
      } else {
        break;
      }
    }
    return node;
  }

  private parseArrayLiteral(): AST {
    const elements: AST[] = [];
    this.parseCommaSeparated("]", "array elements", () => {
      elements.push(this.parseAdditive());
    });
    return { type: "array", elements };
  }

  private parseBlock(): AST {
    const statements = this.parseStatements(true);
    return { type: "block", statements };
  }

  private parseIf(): AST {
    const { condition, body } = this.parseConditionBlock("if");
    let elseBranch: AST | null = null;
    const next = this.peek();
    if (next && next.type === "identifier" && next.value === "else") {
      this.consume();
      elseBranch = this.parseBracedBlock();
    }
    return { type: "if", condition, then: body, else: elseBranch };
  }

  private parseBracedBlock(): AST {
    const open = this.consume();
    if (open.type !== "paren" || open.value !== "{") {
      throw new Error(`Expected {, got: ${JSON.stringify(open)}`);
    }
    const statements = this.parseStatements(true);
    return { type: "block", statements };
  }

  private parseWhile(): AST {
    const { condition, body } = this.parseConditionBlock("while");
    return { type: "while", condition, body };
  }

  private parseConditionBlock(keyword: string): { condition: AST; body: AST } {
    const open = this.consume();
    if (open.type !== "paren" || open.value !== "(") {
      throw new Error(`Expected ( after ${keyword}, got: ${JSON.stringify(open)}`);
    }
    const condition = this.parseAdditive();
    const close = this.consume();
    if (close.type !== "paren" || close.value !== ")") {
      throw new Error(`Expected ) after ${keyword} condition, got: ${JSON.stringify(close)}`);
    }
    const body = this.parseBracedBlock();
    return { condition, body };
  }

  private parseStatements(inBlock: boolean): AST[] {
    const statements: AST[] = [];

    while (true) {
      const token = this.peek();
      if (!token) {
        if (inBlock) {
          throw new Error("Unexpected end of input in block");
        }
        break;
      }
      if (token.type === "paren" && token.value === "}") {
        if (inBlock) {
          this.consume();
          break;
        }
        throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
      }
      if (token.type === "identifier" && token.value === "else") {
        if (inBlock) {
          break;
        }
        throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
      }

      statements.push(this.parseStatement());

      const next = this.peek();
      if (next && next.type === "semicolon") {
        this.consume();
      }
    }

    return statements;
  }

  private parseStatement(): AST {
    const token = this.peek();
    if (token && token.type === "identifier" && token.value === "let") {
      return this.parseLet();
    }
    if (token && token.type === "identifier" && token.value === "fn") {
      return this.parseFn();
    }
    return this.parseAdditive();
  }

  private parseLet(): AST {
    this.consume();
    let mutable = false;
    let nameToken = this.peek();
    if (nameToken && nameToken.type === "identifier" && nameToken.value === "mut") {
      this.consume();
      mutable = true;
      nameToken = this.peek();
    }
    if (!nameToken || nameToken.type !== "identifier") {
      throw new Error(`Expected identifier after let, got: ${JSON.stringify(nameToken)}`);
    }
    this.consume();
    const typeName = this.parseTypeAnnotation("Expected type annotation");
    const eq = this.consume();
    if (eq.type !== "operator" || eq.value !== "=") {
      throw new Error(`Expected = after let ${nameToken.value}, got: ${JSON.stringify(eq)}`);
    }
    const value = this.parseAdditive();
    const node: AST = { name: nameToken.value, mutable, typeName, value } as AST;
    node.type = "let";
    return node;
  }

  private parseFn(): AST {
    this.consume();
    const nameToken = this.consume();
    if (nameToken.type !== "identifier") {
      throw new Error(`Expected function name, got: ${JSON.stringify(nameToken)}`);
    }
    const params = this.parseParams();
    const returnType = this.parseTypeAnnotation("Expected return type");
    const arrow = this.consume();
    if (arrow.type !== "operator" || arrow.value !== "=>") {
      throw new Error(`Expected => after function signature, got: ${JSON.stringify(arrow)}`);
    }
    const body = this.parseAdditive();
    const node: AST = { name: nameToken.value, params, returnType, body } as AST;
    node.type = "fn";
    return node;
  }

  private parseParams(): Param[] {
    const open = this.consume();
    if (open.type !== "paren" || open.value !== "(") {
      throw new Error(`Expected ( for parameters, got: ${JSON.stringify(open)}`);
    }
    const params: Param[] = [];
    this.parseCommaSeparated(")", "parameters", () => {
      const nameToken = this.consume();
      if (nameToken.type !== "identifier") {
        throw new Error(`Expected parameter name, got: ${JSON.stringify(nameToken)}`);
      }
      const typeName = this.parseTypeAnnotation("Expected parameter type");
      params.push({ name: nameToken.value, typeName });
    });
    return params;
  }

  private parseCall(name: string): AST {
    this.consume();
    const args: AST[] = [];
    this.parseCommaSeparated(")", "arguments", () => {
      args.push(this.parseAdditive());
    });
    return { type: "call", callee: { type: "identifier", name }, args };
  }

  private parseCommaSeparated(closing: string, what: string, parseItem: () => void): void {
    const closingType = closing === ")" ? "paren" : "bracket";
    if (this.peek() && this.peek()!.type === closingType && this.peek()!.value === closing) {
      this.consume();
      return;
    }
    while (true) {
      parseItem();
      const next = this.peek();
      if (next && next.type === "comma") {
        this.consume();
        continue;
      }
      const close = this.consume();
      if (close.type !== closingType || close.value !== closing) {
        throw new Error(`Expected ${closing} after ${what}, got: ${JSON.stringify(close)}`);
      }
      break;
    }
  }

  private parseTypeAnnotation(errorMessage: string): TypeName | undefined {
    const colon = this.peek();
    if (!colon || colon.type !== "colon") {
      return undefined;
    }
    this.consume();
    return this.parseType(errorMessage);
  }

  private parseType(errorMessage: string): TypeName {
    const open = this.consume();
    if (open.type === "bracket" && open.value === "[") {
      const elementType = this.parseTypeName(errorMessage);
      const semi = this.consume();
      if (semi.type !== "semicolon") {
        throw new Error(`Expected ; in array type, got: ${JSON.stringify(semi)}`);
      }
      const sizeToken = this.consume();
      if (sizeToken.type !== "number") {
        throw new Error(`Expected array size, got: ${JSON.stringify(sizeToken)}`);
      }
      const close = this.consume();
      if (close.type !== "bracket" || close.value !== "]") {
        throw new Error(`Expected ] in array type, got: ${JSON.stringify(close)}`);
      }
      return { kind: "array", elementType, size: sizeToken.value };
    }
    if (open.type !== "identifier" || !TYPE_NAMES.includes(open.value as TypeName)) {
      throw new Error(`${errorMessage}, got: ${JSON.stringify(open)}`);
    }
    return open.value as TypeName;
  }

  private parseTypeName(errorMessage: string): TypeName {
    const token = this.consume();
    if (token.type !== "identifier" || !TYPE_NAMES.includes(token.value as TypeName)) {
      throw new Error(`${errorMessage}, got: ${JSON.stringify(token)}`);
    }
    return token.value as TypeName;
  }
}

export function parse(tokens: Token[]): AST {
  return new Parser(tokens).parse();
}
