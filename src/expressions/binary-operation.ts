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
  return performBinaryOp(
    interpretWithScope(
      s.slice(0, opIndex).trim(),
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
    op,
    interpretWithScope(
      s.slice(opIndex + 1).trim(),
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
    extractTypedInfo(s.slice(0, opIndex).trim()),
    s.slice(opIndex + 1).trim(),
  );
}
