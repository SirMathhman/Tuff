import type { Token } from "./tokenizer";
import type { AstNode } from "./ast";

type ParseFn = () => AstNode;

export function parse(tokens: Token[]): AstNode {
  let pos = 0;
  let maxIterations = tokens.length * 100 + 1000;

  function parseLevel(ops: string[], next: ParseFn): ParseFn {
    return (): AstNode => {
      let node = next();
      while (pos < tokens.length) {
        maxIterations--;
        if (maxIterations <= 0) break;
        const op = tokens[pos];
        if (
          op !== undefined &&
          op.type === "operator" &&
          ops.includes(op.value)
        ) {
          pos++;
          const right = next();
          node = {
            kind: "binary",
            op: op.value as "+" | "-" | "*",
            left: node,
            right,
          };
        } else {
          break;
        }
      }
      return node;
    };
  }

  const OPENING: Record<string, string> = { "(": ")", "{": "}" };

  function parseBlock(): AstNode {
    const statements: AstNode[] = [];
    while (pos < tokens.length) {
      maxIterations--;
      if (maxIterations <= 0) break;
      const token = tokens[pos];
      if (token !== undefined && token.type === "group" && token.value === "}") {
        pos++;
        break;
      }
      const prevPos = pos;
      const stmt = parseStatement();
      if (prevPos === pos) {
        pos++;
      }
      statements.push(stmt);
    }
    return { kind: "block", statements };
  }

  function parseStatement(): AstNode {
    const token = tokens[pos];
    if (token !== undefined && token.type === "keyword" && token.value === "let") {
      pos++;
      const nameToken = tokens[pos];
      let name = "";
      if (nameToken !== undefined && nameToken.type === "identifier") {
        name = nameToken.value;
        pos++;
      }
      const assignToken = tokens[pos];
      if (assignToken !== undefined && assignToken.type === "operator" && assignToken.value === "=") {
        pos++;
      }
      const value = parseExpression();
      const semiToken = tokens[pos];
      if (semiToken !== undefined && semiToken.type === "punctuator" && semiToken.value === ";") {
        pos++;
      }
      return { kind: "let", name, value };
    }
    return parseExpression();
  }

  const parseAtom: ParseFn = (): AstNode => {
    const token = tokens[pos];
    if (token !== undefined && token.type === "number") {
      pos++;
      return { kind: "number", value: token.value };
    }
    if (token !== undefined && token.type === "identifier") {
      pos++;
      return { kind: "identifier", name: token.value };
    }
    if (
      token !== undefined &&
      token.type === "group" &&
      token.value in OPENING
    ) {
      pos++;
      if (token.value === "{") {
        return parseBlock();
      }
      const node = parseExpression();
      const closing = tokens[pos];
      if (
        closing !== undefined &&
        closing.type === "group" &&
        closing.value === OPENING[token.value]
      ) {
        pos++;
      }
      return node;
    }
    return { kind: "number", value: 0 };
  };

  const parseTerm = parseLevel(["*", "/"], parseAtom);
  const parseExpression = parseLevel(["+", "-"], parseTerm);

  return parseExpression();
}
