import { matchWord } from "../../parsing/string-helpers";

/**
 * Helper to try transform and fallback on failure
 */
export function tryTransform(
  keyword: string,
  transform: () => { result: string; endIdx: number } | undefined,
): { success: boolean; result?: string; endIdx?: number } {
  const transformed = transform();
  if (transformed) {
    return {
      success: true,
      result: transformed.result,
      endIdx: transformed.endIdx,
    };
  }
  return { success: false };
}

/**
 * Try to transform control flow at current position
 */
export function tryControlFlowTransform(
  source: string,
  i: number,
  transformFunctions: {
    match: () => { result: string; endIdx: number } | undefined;
    loop: () => { result: string; endIdx: number } | undefined;
    while: () => { result: string; endIdx: number } | undefined;
    for: () => { result: string; endIdx: number } | undefined;
    if: () => { result: string; endIdx: number } | undefined;
  },
): { handled: boolean; result: string; endIdx: number } {
  const transforms: [
    string,
    () => { result: string; endIdx: number } | undefined,
  ][] = [
    ["match", transformFunctions.match],
    ["while", transformFunctions.while],
    ["for", transformFunctions.for],
    ["loop", transformFunctions.loop],
    ["if", transformFunctions.if],
  ];

  for (const [keyword, transform] of transforms) {
    if (matchWord(source, i, keyword)) {
      const { success, result, endIdx } = tryTransform(keyword, transform);
      if (success && endIdx && result !== undefined) {
        return { handled: true, result, endIdx };
      }
    }
  }

  return { handled: false, result: "", endIdx: i };
}
