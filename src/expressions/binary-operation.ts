import { findOperatorIndex, performBinaryOp } from "../operators";
import { parseTypedNumber, extractTypedInfo } from "../parser";
import type { Interpreter } from "./handlers";

export function handleBinaryOperation(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number {
  const { index: opIndex, operator: op } = findOperatorIndex(s);
  if (opIndex === -1) return parseTypedNumber(s);

  const leftStr = s.slice(0, opIndex).trim();
  const rightStr =
    op === "is"
      ? s.slice(opIndex + 3).trim()
      : s.slice(opIndex + op.length).trim();

  // For 'is' operator, we need different handling
  if (op === "is") {
    const leftValue = interpretWithScope(
      leftStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
    return performBinaryOp(
      leftValue,
      op,
      0, // right value is not used for 'is'
      extractTypedInfo(leftStr),
      rightStr,
      typeMap,
      leftStr,
    );
  }

  return performBinaryOp(
    interpretWithScope(
      leftStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
    op,
    interpretWithScope(
      rightStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
    extractTypedInfo(leftStr),
    rightStr,
    typeMap,
    leftStr,
  );
}
