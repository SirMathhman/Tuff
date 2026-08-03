export class Env {
  private vars: Map<string, { value: number; mutable: boolean }>;

  constructor(private parent: Env | null = null, vars?: Map<string, { value: number; mutable: boolean }>) {
    this.vars = vars ?? new Map();
  }

  define(name: string, value: number, mutable: boolean): void {
    this.vars.set(name, { value, mutable });
  }

  get(name: string): number {
    const binding = this.vars.get(name);
    if (binding !== undefined) {
      return binding.value;
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`Undefined variable: ${name}`);
  }

  assign(name: string, value: number): void {
    const binding = this.vars.get(name);
    if (binding !== undefined) {
      if (!binding.mutable) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
      }
      binding.value = value;
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new Error(`Undefined variable: ${name}`);
  }

  child(): Env {
    return new Env(this);
  }
}
