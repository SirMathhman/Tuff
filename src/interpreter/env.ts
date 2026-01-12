import type { Env, EnvItem } from "./types";

// Track transient shadowed names per-env so constructs like for-loops can
// prevent loop-scoped names from being visible after the loop.
export const blockShadow: WeakMap<Env, Set<string>> = new WeakMap();

export function makeDeletedEnvItem(): EnvItem {
  return { value: NaN, mutable: false, type: "__deleted__" } as EnvItem;
}
