import type { Interpreter } from "./handlers";

export function handleUnaryOperation(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
  const check = (expr: string): boolean => expr.trim().startsWith("!");
  if (check(s)) {
    const op = s.trim().slice(1).trim();
    const v = interpretWithScope(
      op,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
    return v === 0 ? 1 : 0;
  }
  const checkMinus = (expr: string): boolean => expr.trim().startsWith("-");
  if (checkMinus(s)) {
    const op = s.trim().slice(1).trim();
    if (op.length > 0) {
      const first = op[0];
      if (first && first >= "0" && first <= "9") return undefined;
    }
    let hasSuffix = false;
    for (let i = 0; i < op.length; i++) {
      const c = op[i];
      if (c && (c === "U" || c === "I")) {
        if (i + 1 < op.length) {
          const next = op[i + 1];
          if (next && next >= "0" && next <= "9") {
            hasSuffix = true;
            break;
          }
        }
      }
    }
    if (hasSuffix) return undefined;
    const v = interpretWithScope(
      op,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
    return -v;
  }
  return undefined;
}
