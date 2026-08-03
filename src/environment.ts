import type { Value } from "./types";

interface Binding {
  value: Value;
  mutable: boolean;
}

export class Environment {
  private bindings = new Map<string, Binding>();

  constructor(private readonly parent?: Environment) {}

  define(name: string, value: Value, mutable: boolean): void {
    this.bindings.set(name, { value, mutable });
  }

  lookup(name: string): Value {
    const env = this.resolve(name);
    if (!env) {
      throw new Error(`Undefined variable: ${name}`);
    }
    return env.bindings.get(name)!.value;
  }

  assign(name: string, value: Value): void {
    const env = this.resolve(name);
    if (!env) {
      throw new Error(`Undefined variable: ${name}`);
    }
    const binding = env.bindings.get(name)!;
    if (!binding.mutable) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    binding.value = value;
  }

  child(): Environment {
    return new Environment(this);
  }

  private resolve(name: string): Environment | undefined {
    if (this.bindings.has(name)) {
      return this;
    }
    return this.parent?.resolve(name);
  }
}
