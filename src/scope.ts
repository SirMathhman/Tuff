import type { NameNode } from "./ast.ts";

/** The values of one open block's bindings, in binding order. */
export type Frame<T> = T[];

/** Where a name use is bound: how many blocks out, and its position in that block. */
export interface NameRef {
  /** Number of blocks to walk outward; 0 means the innermost block. */
  depth: number;
  /** Position of the binding within its block. */
  index: number;
}

/** The binding of every name use in the program, keyed by the use's AST node. */
export type NameRefs = Map<NameNode, NameRef>;

/** A `let` binding within one block. */
export interface Slot {
  /** Position among the block's `let` statements. */
  index: number;
  /** Whether the binding may be assigned (`let mut`). */
  mutable: boolean;
}

/** The names bound so far in one block. */
export type NameTable = Map<string, Slot>;

/** A binding found by name lookup. */
export interface Found {
  /** Where the binding is. */
  ref: NameRef;
  /** Whether the binding may be assigned (`let mut`). */
  mutable: boolean;
}

/**
 * Finds a name, searching the innermost block first.
 *
 * @param blocks - The open blocks' name tables, outermost first.
 * @param name - The name to find.
 * @returns The binding, or `undefined` if no open block binds `name`.
 */
export function findName(blocks: NameTable[], name: string): Found | undefined {
  for (let level = blocks.length - 1; level >= 0; level--) {
    const slot = blocks[level]?.get(name);
    if (slot !== undefined) {
      return { ref: { depth: blocks.length - 1 - level, index: slot.index }, mutable: slot.mutable };
    }
  }
  return undefined;
}
