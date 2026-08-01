// Scope: tracks declared variables and their mutability, with lexical
// inheritance via a parent pointer. No classes — uses a factory with closures.

export interface Scope {
  declare(name: string, isMut: boolean): void;
  isDeclared(name: string): boolean;
  isMutable(name: string): boolean;
  child(): Scope;
}

export function createScope(parent?: Scope): Scope {
  const declared = new Set<string>();
  const mutable = new Set<string>();

  return {
    declare(name, isMut) {
      declared.add(name);
      if (isMut) {
        mutable.add(name);
      }
    },
    isDeclared(name) {
      return (
        declared.has(name) || (parent !== undefined && parent.isDeclared(name))
      );
    },
    isMutable(name) {
      return (
        mutable.has(name) || (parent !== undefined && parent.isMutable(name))
      );
    },
    child() {
      return createScope(this);
    },
  };
}
