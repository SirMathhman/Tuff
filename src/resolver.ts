import { NodeKind, StatementKind, type BlockNode, type ChainNode, type Expr, type NameNode } from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import { findName, type Found, type NameRefs, type NameTable } from "./scope.ts";

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

/**
 * Binds one name use to its binding and records it.
 *
 * @param name - The name use.
 * @param blocks - The open blocks' name tables, outermost first.
 * @param refs - The table of name bindings being built.
 * @returns The binding found, or an `UnknownName` error at the name.
 */
function lookupUse(name: NameNode, blocks: NameTable[], refs: NameRefs): Result<Found, TuffError> {
  const found = findName(blocks, name.name);
  if (found === undefined) return err({ kind: TuffErrorKind.UnknownName, span: name.span });
  refs.set(name, found.ref);
  return ok(found);
}

function resolveExpr(expr: Expr, blocks: NameTable[], refs: NameRefs): Result<undefined, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal:
    case NodeKind.Boolean:
      return ok(undefined);
    case NodeKind.Name: {
      const found = lookupUse(expr, blocks, refs);
      if (!found.ok) return found;
      return ok(undefined);
    }
    case NodeKind.Borrow: {
      const found = lookupUse(expr.target, blocks, refs);
      if (!found.ok) return found;
      if (expr.mutable && !found.value.mutable) {
        return err({ kind: TuffErrorKind.ImmutableAssignment, span: expr.target.span });
      }
      return ok(undefined);
    }
    case NodeKind.Deref:
      return resolveExpr(expr.operand, blocks, refs);
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
    if (statement.kind === StatementKind.AssignThrough) {
      const target = resolveExpr(statement.target, blocks, refs);
      if (!target.ok) return target;
      const value = resolveExpr(statement.value, blocks, refs);
      if (!value.ok) return value;
      continue;
    }
    const target = findName(blocks, statement.target.name);
    if (target === undefined) return err({ kind: TuffErrorKind.UnknownName, span: statement.target.span });
    if (!target.mutable) return err({ kind: TuffErrorKind.ImmutableAssignment, span: statement.target.span });
    refs.set(statement.target, target.ref);
    const value = resolveExpr(statement.value, blocks, refs);
    if (!value.ok) return value;
  }
  if (block.result === undefined) return ok(undefined);
  return resolveExpr(block.result, blocks, refs);
}
