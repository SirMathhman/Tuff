import { findOperatorIndex } from "./parser";

export function splitByAddOperator(
  source: string,
): { leftPart: string; rightPart: string } | undefined {
  const plusIndex = findOperatorIndex(source, "+");
  if (plusIndex === -1) return undefined;

  const leftPart = source.substring(0, plusIndex).trim();
  const rightPart = source.substring(plusIndex + 1).trim();

  return { leftPart, rightPart };
}
