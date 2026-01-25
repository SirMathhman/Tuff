import type { ScopeContext } from "../../types/interpreter";
import { callInterpreter } from "../../types/interpreter";
import type { FunctionCallParams } from "../../utils/function/function-call-params";

function handleNegationOperator(
  s: string,
  ctx: ScopeContext,
): number | undefined {
  if (!s.trim().startsWith("!")) return undefined;
  const op = s.trim().slice(1).trim();
  const v = callInterpreter(ctx, op);
  return v === 0 ? 1 : 0;
}

function hasNumericLiteralOrTypeSuffix(op: string): boolean {
  const first = op[0];
  if (first && first >= "0" && first <= "9") return true;
  for (let i = 0; i < op.length; i++) {
    const c = op[i];
    if (c && (c === "U" || c === "I")) {
      if (i + 1 < op.length) {
        const next = op[i + 1];
        if (next && next >= "0" && next <= "9") return true;
      }
    }
  }
  return false;
}

function handleUnaryMinusOperator(
  s: string,
  ctx: ScopeContext,
): number | undefined {
  if (!s.trim().startsWith("-")) return undefined;
  const op = s.trim().slice(1).trim();
  if (op.length > 0 && hasNumericLiteralOrTypeSuffix(op)) return undefined;
  return -callInterpreter(ctx, op);
}

type UnaryOpParams = Pick<
  FunctionCallParams,
  | "s"
  | "scope"
  | "typeMap"
  | "mutMap"
  | "uninitializedSet"
  | "unmutUninitializedSet"
  | "interpreter"
  | "visMap"
>;

export function handleUnaryOperation(p: UnaryOpParams): number | undefined {
  const ctx: ScopeContext = {
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    visMap: p.visMap,
    interpreter: p.interpreter,
  };
  const negation = handleNegationOperator(p.s, ctx);
  if (negation !== undefined) return negation;
  return handleUnaryMinusOperator(p.s, ctx);
}
