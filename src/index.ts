import { Diagnostic, Diagnostics } from "./diagnostics";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { analyze } from "./analyzer";
import { emitESM } from "./emitter";

export type CompileOptions = {
  filePath: string;
  source: string;
};

export type CompileOutput = {
  js: string;
  diagnostics: readonly Diagnostic[];
};

export function compileToESM(opts: CompileOptions): CompileOutput {
  const diags = new Diagnostics();
  const tokens = new Lexer(opts.filePath, opts.source).tokenize();
  const program = new Parser(opts.filePath, tokens, diags).parseProgram();
  analyze(program, diags);
  const { js } = emitESM(program);
  return { js, diagnostics: diags.all };
}
