import { lex } from "./lexer.ts";
import { parse } from "./parser.ts";
import { resolve } from "./resolve.ts";
import { codegen } from "./codegen.ts";

export function compileTuffToJS(source: string): string {
  return codegen(resolve(parse(lex(source))));
}
