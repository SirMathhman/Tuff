import type { TuffError } from "../errors.ts";
import type { KindName, TuffStatement } from "../ast.ts";
import { checkKindName } from "./is-match.ts";

/**
 * Resolve `type` alias declarations in a program, in place: each `type`
 * statement's kind name is validated and registered, and every `let`
 * annotation's bare names are rewritten to the alias they name. Aliases
 * must be declared before use.
 * @param statements - The parsed program statements, rewritten in place.
 * @param baseLine - The 1-based line of the first statement.
 * @returns An InvalidNumberSuffix error if an alias names an illegal
 * suffix or kind, else null.
 */
export function resolveTypeAliases(
  statements: TuffStatement[],
  baseLine: number,
): TuffError | null {
  const aliases: Record<string, KindName> = {};
  return resolveStatements(statements, baseLine, aliases);
}

/**
 * Walk a statement list, registering aliases and rewriting annotations.
 * @param statements - The statements to walk.
 * @param baseLine - The 1-based line of the first statement.
 * @param aliases - The aliases registered so far.
 * @returns A TuffError if an alias is illegal, else null.
 */
function resolveStatements(
  statements: TuffStatement[],
  baseLine: number,
  aliases: Record<string, KindName>,
): TuffError | null {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const error = resolveStatement(stmt, baseLine + i, aliases);
    if (error) return error;
  }
  return null;
}

/**
 * Resolve one statement: register a `type` alias, rewrite a `let`
 * annotation, and recurse into nested statements.
 * @param stmt - The statement to resolve.
 * @param line - The 1-based line number.
 * @param aliases - The aliases registered so far.
 * @returns A TuffError if an alias is illegal, else null.
 */
function resolveStatement(
  stmt: TuffStatement,
  line: number,
  aliases: Record<string, KindName>,
): TuffError | null {
  if (stmt.kind === "Type") {
    stmt.alias = rewriteKindName(stmt.alias, aliases);
    const error = checkKindName(stmt.alias, line);
    if (error) return error;
    aliases[stmt.name] = stmt.alias;
    return null;
  }
  if (stmt.kind === "Let" && stmt.annotation !== undefined) {
    stmt.annotation = rewriteKindName(stmt.annotation, aliases);
  }
  if (stmt.kind === "Block") {
    return resolveStatements(stmt.statements, line, aliases);
  }
  if (stmt.kind === "If") {
    const error = resolveStatement(stmt.then, line, aliases);
    return error ?? (stmt.else ? resolveStatement(stmt.else, line, aliases) : null);
  }
  if (stmt.kind === "While" || stmt.kind === "For") {
    return resolveStatement(stmt.body, line, aliases);
  }
  return null;
}

/**
 * Rewrite the bare names in a kind name to the aliases they name.
 * @param name - The kind name to rewrite.
 * @param aliases - The aliases registered so far.
 * @returns The rewritten kind name.
 */
function rewriteKindName(
  name: KindName,
  aliases: Record<string, KindName>,
): KindName {
  if (name.kind === "KindNameBare") {
    const alias = aliases[name.name];
    return alias !== undefined ? alias : name;
  }
  if (name.kind === "KindNameTuple") {
    return {
      kind: "KindNameTuple",
      elements: name.elements.map((element) => rewriteKindName(element, aliases)),
    };
  }
  if (name.kind === "KindNameArray") {
    return {
      kind: "KindNameArray",
      element: rewriteKindName(name.element, aliases),
      length: name.length,
    };
  }
  return name;
}
