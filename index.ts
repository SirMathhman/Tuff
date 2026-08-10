import { tokenize } from './src/tokenizer';
import { Parser } from './src/parser';
import { validateScopes } from './src/validator';
import { generateJS } from './src/generator';

export function compileTuffToJS(tuffSource: string): string {
  const tokens = tokenize(tuffSource);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  validateScopes(ast);
  return generateJS(ast);
}
