import { lex } from "./src/lexer";
import { parse } from "./src/parser";
import { evaluate } from "./src/evaluator";

export function interpret(source: string) {
  if (source === "") {
    return 0;
  }
  const tokens = lex(source);
  const ast = parse(tokens);
  return evaluate(ast);
}
