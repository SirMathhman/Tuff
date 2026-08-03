import type { Value } from "./value";
import { RuntimeError } from "./errors";

export interface Binding {
  value: Value;
  mutable: boolean;
}

export class Env {
  private vars: Map<string, Binding>;

  constructor(private parent: Env | null = null, vars?: Map<string, Binding>) {
    this.vars = vars ?? new Map();
  }

  define(name: string, value: Value, mutable: boolean): void {
    this.vars.set(name, { value, mutable });
  }

  get(name: string): Value {
    return this.lookup(name).value;
  }

  assign(name: string, value: Value): void {
    const binding = this.lookup(name);
    if (!binding.mutable) {
      throw new RuntimeError(`Cannot assign to immutable variable: ${name}`);
    }
    binding.value = value;
  }

  private lookup(name: string): Binding {
    const binding = this.vars.get(name);
    if (binding !== undefined) {
      return binding;
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    throw new RuntimeError(`Undefined variable: ${name}`);
  }

  child(): Env {
    return new Env(this);
  }
}
