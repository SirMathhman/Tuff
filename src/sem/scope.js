"use strict";

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.symbols = new Map();
  }

  declare(name, info) {
    if (this.lookupLocal(name)) {
      return { ok: false, message: `Duplicate declaration: ${name}` };
    }
    if (this.lookup(name)) {
      return { ok: false, message: `Shadowing is not allowed: ${name}` };
    }
    this.symbols.set(name, info);
    return { ok: true };
  }

  lookupLocal(name) {
    return this.symbols.get(name) || null;
  }

  lookup(name) {
    let scope = this;
    while (scope) {
      if (scope.symbols.has(name)) return scope.symbols.get(name);
      scope = scope.parent;
    }
    return null;
  }
}

module.exports = { Scope };
