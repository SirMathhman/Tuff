import { tokenize } from "./src/tokenizer";
import { createParser } from "./src/parser";
import { validateScope } from "./src/checker";
import { generateJS } from "./src/codegen";
import { createScope } from "./src/scope";
import type { ASTNode } from "./src/ast";
import type { Result } from "./src/result";
import { ok } from "./src/result";
import type { CompileError } from "./src/compileError";

const IMPLICIT_PREFIX = "in let args : &[Str]; ";

export function compileTuffToJS(source: string): Result<string, CompileError> {
  // Strip the implicit declaration prefix
  const userSource = source.startsWith(IMPLICIT_PREFIX)
    ? source.slice(IMPLICIT_PREFIX.length)
    : source;
  const trimmed = userSource.trim();
  if (trimmed === "") {
    return ok("process.exit(0);");
  }

  const tokenResult = tokenize(trimmed);
  if (!tokenResult.ok) return tokenResult;
  const tokens = tokenResult.value;
  const parser = createParser(tokens);

  // Parse all statements separated by semicolons
  const stmts: ASTNode[] = [];
  while (parser.peek().type !== "eof") {
    const stmtResult = parser.parseStatement();
    if (!stmtResult.ok) return stmtResult;
    stmts.push(stmtResult.value);
  }

  // Validate scoping: args is implicitly declared (and immutable)
  const rootScope = createScope();
  rootScope.declare("args", false);
  const scopeResult = validateScope(stmts, rootScope);
  if (!scopeResult.ok) return scopeResult;

  // Generate JS for all statements
  const parts: string[] = [];
  const declared = new Set<string>();
  // Coerce the final expression to a number (exit code model)
  const exitCode = (expr: string) => "Number(" + expr + ")";
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]!;
    if (stmt.kind === "let_decl") {
      const isNew = !declared.has(stmt.name);
      declared.add(stmt.name);
      const valueResult = generateJS(stmt.value);
      if (!valueResult.ok) return valueResult;
      if (isNew) {
        // A let declaration is a declaration, not an expression — it never
        // produces an exit code. Only an expression statement does.
        parts.push("let " + stmt.name + " = " + valueResult.value + ";");
      } else {
        parts.push(stmt.name + " = " + valueResult.value + ";");
      }
    } else if (stmt.kind === "fn_decl") {
      // A function declaration is a declaration, not an expression — it never
      // produces an exit code.
      const fnResult = generateJS(stmt);
      if (!fnResult.ok) return fnResult;
      parts.push(fnResult.value);
    } else {
      const exprResult = generateJS(stmt);
      if (!exprResult.ok) return exprResult;
      if (i === stmts.length - 1) {
        parts.push("process.exit(" + exitCode(exprResult.value) + ");");
      } else {
        parts.push(exprResult.value + ";");
      }
    }
  }

  return ok(parts.join(" "));
}
