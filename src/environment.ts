import type { Value, ReferenceCell } from "./types";
import { isArray } from "./typecheck";

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
    return this.resolveBinding(name).value;
  }

  assign(name: string, value: Value): void {
    const binding = this.resolveMutableBinding(name);
    binding.value = value;
  }

  assignElement(name: string, index: number, value: Value): void {
    const binding = this.resolveMutableBinding(name);
    const arr = binding.value;
    if (!isArray(arr)) {
      throw new Error(`Indexing requires an array: ${name}`);
    }
    if (arr.elements[index] === undefined) {
      throw new Error(`Index out of bounds: ${index}`);
    }
    arr.elements[index] = value;
  }

  reference(name: string): ReferenceCell {
    const binding = this.resolveBinding(name);
    return {
      mutable: binding.mutable,
      get: () => binding.value,
      set: (value) => {
        this.resolveMutableBinding(name).value = value;
      },
    };
  }

  child(): Environment {
    return new Environment(this);
  }

  private resolveMutableBinding(name: string): Binding {
    const binding = this.resolveBinding(name);
    if (!binding.mutable) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    return binding;
  }

  private resolveBinding(name: string): Binding {
    const env = this.resolve(name);
    if (!env) {
      throw new Error(`Undefined variable: ${name}`);
    }
    return env.bindings.get(name)!;
  }

  private resolve(name: string): Environment | undefined {
    if (this.bindings.has(name)) {
      return this;
    }
    return this.parent?.resolve(name);
  }
}
