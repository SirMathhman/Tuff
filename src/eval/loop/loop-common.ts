import { type Result } from "../../core/result";
import { type TuffError } from "../../core/error";
import { type VariableEntry } from "../variables-types";

export type LoopEvaluator = (
  expr: string,
  vars: Map<string, VariableEntry>,
) => Result<number, TuffError>;

export type BreakResult = Result<
  { shouldBreak: boolean; breakValue?: number },
  TuffError
>;

export function extractValueExpression(afterBreak: string): string {
  let valueExpr = "",
    depth = 0;

  for (let i = 0; i < afterBreak.length; i = i + 1) {
    const ch = afterBreak.charAt(i);
    if (ch === "{" || ch === "(") depth = depth + 1;
    if (ch === "}" || ch === ")") {
      if (depth === 0) break;
      depth = depth - 1;
    }
    if (ch === ";" && depth === 0) break;
    valueExpr = valueExpr + ch;
  }

  return valueExpr.trim();
}
