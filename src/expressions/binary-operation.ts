import { findOperatorIndex, performBinaryOp } from "./operators";
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
  let rightStr: string;

  if (op === "is") {
    rightStr = s.slice(opIndex + 3).trim();
  } else if (op === "&&") {
    rightStr = s.slice(opIndex + 2).trim();
  } else {
    rightStr = s.slice(opIndex + op.length).trim();
  }

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

  // For field access operator '.', the right side is a field name, not an expression
  if (op === ".") {
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
      0, // right value is not used for '.'
      extractTypedInfo(leftStr),
      rightStr,
      typeMap,
      leftStr,
    );
  }

  // For array indexing operator '[', the right side is an expression inside brackets
  if (op === "[") {
    const leftValue = interpretWithScope(
      leftStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
    // rightStr contains the index expression followed by ']', remove the trailing ']'
    const indexExpr = rightStr.endsWith("]") ? rightStr.slice(0, -1) : rightStr;
    const indexValue = interpretWithScope(
      indexExpr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
    return performBinaryOp(
      leftValue,
      op,
      indexValue,
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
