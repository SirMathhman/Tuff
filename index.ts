import { tokenize } from "./src/tokenizer";
import { createParser } from "./src/parser";
import { validateScope } from "./src/checker";
import { generateJS } from "./src/codegen";
import type { ASTNode } from "./src/ast";

const IMPLICIT_PREFIX = "in let args : &[Str]; ";

export function compileTuffToJS(source: string): string {
  // Strip the implicit declaration prefix
  const userSource = source.startsWith(IMPLICIT_PREFIX)
    ? source.slice(IMPLICIT_PREFIX.length)
    : source;
  const trimmed = userSource.trim();
  if (trimmed === "") {
    return "process.exit(0);";
  }

  const tokens = tokenize(trimmed);
  const parser = createParser(tokens);

  // Parse all statements separated by semicolons
  const stmts: ASTNode[] = [];
  while (parser.peek().type !== "eof") {
    stmts.push(parser.parseStatement());
  }

  // Validate scoping: args is implicitly declared
  validateScope(stmts, new Set(["args"]));

  // Generate JS for all statements
  const parts: string[] = [];
  const declared = new Set<string>();
  // Coerce the final expression to a number (exit code model)
  const exitCode = (expr: string) => `Number(${expr})`;
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]!;
    if (stmt.kind === "let_decl") {
      const isNew = !declared.has(stmt.name);
      declared.add(stmt.name);
      if (isNew) {
        if (i === stmts.length - 1) {
          parts.push(
            `let ${stmt.name} = ${generateJS(stmt.value)}; process.exit(${exitCode(stmt.name)});`,
          );
        } else {
          parts.push(`let ${stmt.name} = ${generateJS(stmt.value)};`);
        }
      } else {
        if (i === stmts.length - 1) {
          parts.push(
            `process.exit(${exitCode(`${stmt.name} = ${generateJS(stmt.value)}`)});`,
          );
        } else {
          parts.push(`${stmt.name} = ${generateJS(stmt.value)};`);
        }
      }
    } else {
      if (i === stmts.length - 1) {
        parts.push(`process.exit(${exitCode(generateJS(stmt))});`);
      } else {
        parts.push(`${generateJS(stmt)};`);
      }
    }
  }

  return parts.join(" ");
}
