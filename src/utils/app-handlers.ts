import type { Interpreter } from "../expressions/handlers";
import { handleTypeDeclaration } from "../types/type-declarations";
import { handleStructDeclaration } from "../types/structs";
import { handleFunctionDeclaration } from "../functions";

type Params = {
  s: string;
  typeMap: Map<string, number>;
  scope: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  interpreter: Interpreter;
};

export function tryDeclarations(p: Params): number | undefined {
  const t = handleTypeDeclaration(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (t.handled) return t.result;
  const s = handleStructDeclaration(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (s.handled) return s.result;
  const f = handleFunctionDeclaration(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (f.handled) return f.result;
  return undefined;
}

export function hasOperators(s: string): boolean {
  return (
    s.includes("+") ||
    s.includes("-") ||
    s.includes("*") ||
    s.includes("/") ||
    s.includes("<") ||
    s.includes(">") ||
    s.includes("=") ||
    s.includes("!") ||
    s.includes("(") ||
    s.includes("{") ||
    s.includes("[") ||
    s.includes(" is ") ||
    s.includes("&&") ||
    s.includes(".")
  );
}

export function isMatchExpression(s: string): boolean {
  const t = s.trim();
  return t.startsWith("match") && t.slice(5).trimStart().startsWith("(");
}

export function isGroupedExpression(s: string): boolean {
  return s.includes("(") || s.includes("{") || s.includes("[");
}
