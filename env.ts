export interface Binding {
  value: number;
  mutable: boolean;
}

export class Env {
  private vars: Map<string, Binding>;

  constructor(private parent: Env | null = null, vars?: Map<string, Binding>) {
    this.vars = vars ?? new Map();
  }

  define(name: string, value: number, mutable: boolean): void {
    this.vars.set(name, { value, mutable });
  }

  get(name: string): number {
    return this.lookup(name).value;
  }

  assign(name: string, value: number): void {
    const binding = this.lookup(name);
    if (!binding.mutable) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
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
    throw new Error(`Undefined variable: ${name}`);
  }

  child(): Env {
    return new Env(this);
  }
}
