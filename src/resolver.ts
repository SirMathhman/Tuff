import { NodeKind, StatementKind, type BlockNode, type ChainNode, type Expr, type NameNode } from "./ast.ts";
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

/** A name bound in one block: its position among that block's `let` statements, and whether it may be assigned. */
interface Slot {
  index: number;
  mutable: boolean;
}

/** The names bound so far in one block. */
type NameTable = Map<string, Slot>;

/** A found binding: where it is, and whether it may be assigned. */
interface Found {
  ref: NameRef;
  mutable: boolean;
}

/**
 * Binds every name use to its binding and checks that names are bound and assignments are allowed.
 * Computes no values.
 *
 * @param program - The program's top-level block.
 * @returns The binding of each name use, or the first `UnknownName` or `ImmutableAssignment` error.
 */
export function resolve(program: BlockNode): Result<NameRefs, TuffError> {
  const refs: NameRefs = new Map();
  const blocks: NameTable[] = [];
  const checked = resolveExpr(program, blocks, refs);
  if (!checked.ok) return checked;
  return ok(refs);
}

function findSlot(blocks: NameTable[], name: string): Found | undefined {
  for (let level = blocks.length - 1; level >= 0; level--) {
    const slot = blocks[level]?.get(name);
    if (slot !== undefined) {
      return { ref: { depth: blocks.length - 1 - level, index: slot.index }, mutable: slot.mutable };
    }
  }
  return undefined;
}

function resolveExpr(expr: Expr, blocks: NameTable[], refs: NameRefs): Result<undefined, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal:
      return ok(undefined);
    case NodeKind.Name: {
      const found = findSlot(blocks, expr.name);
      if (found === undefined) return err({ kind: TuffErrorKind.UnknownName, span: expr.span });
      refs.set(expr, found.ref);
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
  let letCount = 0;
  for (const statement of block.statements) {
    if (statement.kind === StatementKind.Let) {
      const value = resolveExpr(statement.value, blocks, refs);
      if (!value.ok) return value;
      names.set(statement.name, { index: letCount, mutable: statement.mutable });
      letCount++;
      continue;
    }
    const target = findSlot(blocks, statement.target.name);
    if (target === undefined) return err({ kind: TuffErrorKind.UnknownName, span: statement.target.span });
    if (!target.mutable) return err({ kind: TuffErrorKind.ImmutableAssignment, span: statement.target.span });
    refs.set(statement.target, target.ref);
    const value = resolveExpr(statement.value, blocks, refs);
    if (!value.ok) return value;
  }
  return resolveExpr(block.result, blocks, refs);
}
