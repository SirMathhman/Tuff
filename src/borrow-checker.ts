/** Borrow and ownership state for a variable. */
export enum BorrowKind {
  Immutable = "immutable",
  Mutable = "mutable",
}

/**
 * Check if creating a new reference violates borrow rules.
 * Returns an error message or undefined if the borrow is valid.
 */
export function checkBorrow(
  target: string,
  newKind: BorrowKind,
  borrows: Map<string, BorrowKind>,
): string | undefined {
  const existing = borrows.get(target);
  if (existing === undefined) return undefined;

  if (existing === BorrowKind.Mutable && newKind === BorrowKind.Immutable)
    return "Cannot create immutable reference while mutable reference exists";
  if (existing === BorrowKind.Mutable && newKind === BorrowKind.Mutable)
    return "Cannot create multiple mutable references to the same variable";
  if (existing === BorrowKind.Immutable && newKind === BorrowKind.Mutable)
    return "Cannot create mutable reference while immutable reference exists";

  return undefined;
}

/**
 * Check if using a moved variable is allowed.
 * Returns an error message or undefined if the use is valid.
 */
export function checkMoved(
  name: string,
  moved: Set<string>,
): string | undefined {
  return moved.has(name) ? `Use of moved variable: ${name}` : undefined;
}
