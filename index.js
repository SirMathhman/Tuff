import { tokenize } from "./src/tokenizer.js";
import { parse } from "./src/parser.js";
import { generate } from "./src/generator.js";

export function compile(source) {
  const tokens = tokenize(source);
  const { statements, variables, functions, structs } = parse(tokens);
  return generate(statements, variables, functions, structs);
}

