// Scope: tracks declared variables, their mutability, and their types, with
// lexical inheritance via a parent pointer. No classes — uses a factory with
// closures.

import type { Type } from "./ast";

export interface Scope {
  declare(name: string, isMut: boolean, type?: Type): void;
  isDeclared(name: string): boolean;
  isMutable(name: string): boolean;
  // Return the declared type of a variable, or undefined if it has none.
  typeOf(name: string): Type | undefined;
  child(): Scope;
}

export function createScope(parent?: Scope): Scope {
  const declared = new Set<string>();
  const mutable = new Set<string>();
  const types = new Map<string, Type>();

  return {
    declare(name, isMut, type) {
      declared.add(name);
      if (isMut) {
        mutable.add(name);
      }
      if (type !== undefined) {
        types.set(name, type);
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
    typeOf(name) {
      if (types.has(name)) {
        return types.get(name);
      }
      return parent !== undefined ? parent.typeOf(name) : undefined;
    },
    child() {
      return createScope(this);
    },
  };
}
