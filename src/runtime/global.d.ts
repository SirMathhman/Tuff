import type { Env } from "./env";

declare global {
  // Exposed so `eval.ts` can call interpret without circular imports.
  // (Set in `src/interpret.ts`.)
  var interpret: ((_input: string, _env?: Env) => number) | undefined;
}

export {};
