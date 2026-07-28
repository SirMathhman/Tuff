import type { Token } from "./tokenizer";
import type { AstNode } from "./ast";

type ParseFn = () => AstNode;

export function parse(tokens: Token[]): AstNode {
  let pos = 0;

  function parseLevel(ops: string[], next: ParseFn): ParseFn {
    return (): AstNode => {
      let node = next();
      while (pos < tokens.length) {
        const op = tokens[pos];
        if (op !== undefined && op.type === "operator" && ops.includes(op.value)) {
          pos++;
          const right = next();
          node = { kind: "binary", op: op.value, left: node, right };
        } else {
          break;
        }
      }
      return node;
    };
  }

  const parseAtom: ParseFn = (): AstNode => {
    const token = tokens[pos];
    if (token !== undefined && token.type === "number") {
      pos++;
      return { kind: "number", value: token.value };
    }
    if (token !== undefined && token.type === "paren" && token.value === "(") {
      pos++;
      const node = parseExpression();
      const closing = tokens[pos];
      if (closing !== undefined && closing.type === "paren" && closing.value === ")") {
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
