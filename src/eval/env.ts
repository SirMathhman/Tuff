import type { Frame, NameRefs } from "../scope.ts";
import type { Value } from "../value.ts";

/** The state of one evaluation: the resolver's name bindings and the values of the open blocks. */
export interface Env {
  /** The binding of every name use, from the resolver. */
  refs: NameRefs;
  /** Values of the open blocks, outermost first; each block's values are in binding order. */
  frames: Frame<Value>[];
}
