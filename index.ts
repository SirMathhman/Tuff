import type { AstNode } from "./src/ast.ts";
import type { EvalFailure } from "./src/errors.ts";
import { evalAst } from "./src/evaluator.ts";
import { lex } from "./src/lexer.ts";
import { parse } from "./src/parser.ts";

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: EvalFailure };

export function evaluate(input: string): EvalResult {
  const lexed = lex(input);
  if (!lexed.ok) {
    return lexed;
  }
  const parsed = parse(lexed.tokens);
  if (!parsed.ok) {
    return parsed;
  }
  const result = evalAst(parsed.ast);
  if (!result.ok) {
    return result;
  }
  if (typeof result.value !== "number") {
    return {
      ok: false,
      error: {
        kind: "type",
        message: "expected a number",
        position: valueNode(parsed.ast).position,
      },
    };
  }
  return { ok: true, value: result.value };
}

// The node that produces the final value: follow statement bodies to the leaf.
function valueNode(ast: AstNode): AstNode {
  let node = ast;
  while (
    node.type === "let" ||
    node.type === "assign" ||
    node.type === "derefAssign"
  ) {
    node = node.body;
  }
  return node;
}
