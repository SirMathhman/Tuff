import { err, ok, type Result } from "./src/result";
import { describeUnsupported, skipSpaces, type Problem } from "./src/lexing";
import { type Cursor, type HostValue, type ModuleLoader } from "./src/types";
import { newCursor } from "./src/scope";
import { type Grammar } from "./src/grammar/grammar";
import { parseBlockBody } from "./src/grammar/expression";
import { parseStatementBlock, parseStatementList } from "./src/grammar/statements";

/**
 * Interprets a Tuff program and returns its result.
 *
 * @param tuffSource - The Tuff source text to interpret.
 * @param hostValues - Values and functions the host supplies, by name, for "declare let" and "declare fn" declarations.
 * @param modules - Loads imported modules by name.
 * @returns An Ok result with the numeric result of the program, or an Err result describing what is wrong, where, why, and how to fix it.
 */
export function interpretTuff(
  tuffSource: string,
  hostValues: ReadonlyMap<string, HostValue> = new Map(),
  modules: ModuleLoader = () => undefined,
): Result<number, string> {
  const result = parseProgram(tuffSource, hostValues, modules);
  if (result.ok) {
    const value = result.value;
    if (typeof value === "boolean") {
      return ok(value ? 1 : 0);
    }
    return ok(value);
  }
  return err(describeUnsupported(tuffSource, result.error));
}

/**
 * The grammar entry points that the fragments under src/grammar/ re-enter. It is built once here, so
 * each fragment receives the statement parsers without importing this file.
 */
const grammar: Grammar = {
  statements: (text, cursor) => parseStatementList(text, cursor, grammar),
  statementBlock: (text, cursor) => parseStatementBlock(text, cursor, grammar),
};

/**
 * Parses the statements at the cursor, as used by the module driver. Declarations, assignments, and
 * statement blocks are accepted; the final expression is not parsed.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the statements.
 * @returns The first problem found, or undefined if all statements parsed.
 */
export function parseStatements(text: string, cursor: Cursor): Problem | undefined {
  return grammar.statements(text, cursor);
}

/**
 * Parses the whole source as one expression.
 *
 * Grammar:
 *   program    := statement* expression
 *   block      := "{" statement* expression "}"
 *   statement  := "let" ["mut"] name "=" expression ";" | name "=" expression ";" | "*" factor "=" expression ";"
 *               | name ("+=" | "-=" | "*=") expression ";"   (numeric variables declared with "let mut")
 *               | "namespace" name "{" statement* "}"   (only names declared with "out let" are read, as name::member)
 *               | "{" statement* "}"   (a block with no final expression)
 *               | "if" "(" expression ")" statement ["else" statement]   (branches are non-declaration statements)
 *               | "while" "(" expression ")" statement   (re-run until the condition is false, up to a limit)
 *               | "for" "(" "let" ["mut"] name "=" expression ";" expression ";" statement ")" statement
 *   match      := "match" "(" expression ")" "{" ("case" (expression | "_") "=>" expression ";")* "}"
 *   expression := sum (("==" | "<") sum)*
 *   sum        := term (("+" | "-") term)*
 *   term       := factor ("*" factor)*
 *   factor     := number | "true" | "false" | name | name "::" name | "&" ["mut"] name | "*" factor | "(" expression ")" | block
 *               | "if" "(" expression ")" expression "else" expression
 *
 * This grammar covers expressions and statements only. Declarations and module forms are parsed in src/parse/.
 * The meaning of each form is described in docs/language.md.
 *
 * @param text - The source to parse.
 * @param hostValues - Values and functions the host supplies, by name.
 * @param modules - Loads imported modules by name.
 * @returns An Ok result with the number or boolean result, or an Err result with the first problem found.
 */
function parseProgram(
  text: string,
  hostValues: ReadonlyMap<string, HostValue>,
  modules: ModuleLoader,
): Result<number | boolean, Problem> {
  const cursor = newCursor(hostValues, modules, new Map(), new Map());
  skipSpaces(text, cursor);
  if (cursor.pos >= text.length) {
    return ok(0);
  }
  cursor.pos = 0;
  const value = parseBlockBody(text, cursor, grammar);
  if (!value.ok) {
    return value;
  }
  skipSpaces(text, cursor);
  if (cursor.pos < text.length) {
    return err({ offset: cursor.pos, expected: `"+", "-", "*", "==" or end of input` });
  }
  const result = value.value;
  if (typeof result === "object") {
    return err({ offset: cursor.pos, expected: `a number or boolean as the program's result` });
  }
  return ok(result);
}
