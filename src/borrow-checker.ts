/** Borrow and ownership state for a variable. */
export enum BorrowKind {
  Immutable = "immutable",
  Mutable = "mutable",
}

/**
 * Centralized ownership tracker for borrow and move semantics.
 * Replaces ad-hoc Map/Set access scattered across the type checker.
 */
export class OwnershipTracker {
  private borrows = new Map<string, BorrowKind>();
  private moved = new Set<string>();

  /** Record a new borrow. Throws if it violates borrow rules. */
  recordBorrow(name: string, kind: BorrowKind): void {
    const existing = this.borrows.get(name);
    if (existing === BorrowKind.Mutable && kind === BorrowKind.Immutable)
      throw new Error(
        "Cannot create immutable reference while mutable reference exists",
      );
    if (existing === BorrowKind.Mutable && kind === BorrowKind.Mutable)
      throw new Error(
        "Cannot create multiple mutable references to the same variable",
      );
    if (existing === BorrowKind.Immutable && kind === BorrowKind.Mutable)
      throw new Error(
        "Cannot create mutable reference while immutable reference exists",
      );
    this.borrows.set(name, kind);
  }

  /** Check that a variable hasn't been moved. */
  checkUse(name: string): void {
    if (this.moved.has(name)) throw new Error(`Use of moved variable: ${name}`);
  }

  /** Mark a variable as moved. */
  markMoved(name: string): void {
    this.moved.add(name);
  }

  /** Check that a variable isn't being copied while borrowed. */
  checkCopy(name: string): void {
    if (this.borrows.has(name))
      throw new Error(
        `Cannot copy variable '${name}' while active borrow exists`,
      );
  }

  /**
   * Check for dangling references at block end.
   * Returns names of borrowed variables that were declared locally.
   */
  checkBlockEnd(localVars: Iterable<string>): string[] {
    const dangling: string[] = [];
    for (const local of localVars) {
      if (this.borrows.has(local)) dangling.push(local);
    }
    return dangling;
  }
}
