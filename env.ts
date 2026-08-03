export class Env {
  private vars: Map<string, number>;

  constructor(private parent: Env | null = null, vars?: Map<string, number>) {
    this.vars = vars ?? new Map();
  }

  define(name: string, value: number): void {
    this.vars.set(name, value);
  }

  get(name: string): number {
    const value = this.vars.get(name);
    if (value !== undefined) {
      return value;
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`Undefined variable: ${name}`);
  }

  child(): Env {
    return new Env(this);
  }
}
