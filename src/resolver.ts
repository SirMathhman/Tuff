import { NodeKind, type BlockNode, type ChainNode, type Expr, type NameNode } from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";

/** Where a name use is bound: how many blocks out, and its position in that block. */
export interface NameRef {
  /** Number of blocks to walk outward; 0 means the innermost block. */
  depth: number;
  /** Position of the binding within its block. */
  index: number;
}

/** The binding of every name use in the program, keyed by the use's AST node. */
export type NameRefs = Map<NameNode, NameRef>;

/** The names bound so far in one block, mapped to their positions. */
type NameTable = Map<string, number>;

/**
 * Binds every name use to its binding. Computes no values.
 *
 * @param program - The program's top-level block.
 * @returns The binding of each name use, or an `UnknownName` error at the first unbound name.
 */
export function resolve(program: BlockNode): Result<NameRefs, TuffError> {
  const refs: NameRefs = new Map();
  const blocks: NameTable[] = [];
  const checked = resolveExpr(program, blocks, refs);
  if (!checked.ok) return checked;
  return ok(refs);
}

function findName(blocks: NameTable[], name: string): NameRef | undefined {
  for (let level = blocks.length - 1; level >= 0; level--) {
    const index = blocks[level]?.get(name);
    if (index !== undefined) return { depth: blocks.length - 1 - level, index };
  }
  return undefined;
}

function resolveExpr(expr: Expr, blocks: NameTable[], refs: NameRefs): Result<undefined, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal:
      return ok(undefined);
    case NodeKind.Name: {
      const ref = findName(blocks, expr.name);
      if (ref === undefined) return err({ kind: TuffErrorKind.UnknownName, span: expr.span });
      refs.set(expr, ref);
      return ok(undefined);
    }
    case NodeKind.Chain:
      return resolveChain(expr, blocks, refs);
    case NodeKind.Block:
      return resolveBlock(expr, blocks, refs);
  }
}

function resolveChain(chain: ChainNode, blocks: NameTable[], refs: NameRefs): Result<undefined, TuffError> {
  const first = resolveExpr(chain.first, blocks, refs);
  if (!first.ok) return first;
  for (const step of chain.steps) {
    const operand = resolveExpr(step.operand, blocks, refs);
    if (!operand.ok) return operand;
  }
  return ok(undefined);
}

function resolveBlock(block: BlockNode, blocks: NameTable[], refs: NameRefs): Result<undefined, TuffError> {
  const names: NameTable = new Map();
  blocks.push(names);
  const checked = resolveBlockBody(block, names, blocks, refs);
  blocks.pop();
  return checked;
}

function resolveBlockBody(
  block: BlockNode,
  names: NameTable,
  blocks: NameTable[],
  refs: NameRefs,
): Result<undefined, TuffError> {
  for (const [index, binding] of block.bindings.entries()) {
    const value = resolveExpr(binding.value, blocks, refs);
    if (!value.ok) return value;
    names.set(binding.name, index);
  }
  return resolveExpr(block.result, blocks, refs);
}
