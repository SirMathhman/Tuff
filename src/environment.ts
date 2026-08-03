export class Environment {
  private values = new Map<string, number>();
  private mutable = new Map<string, boolean>();

  constructor(private readonly parent?: Environment) {}

  define(name: string, value: number, mutable: boolean): void {
    this.values.set(name, value);
    this.mutable.set(name, mutable);
  }

  lookup(name: string): number {
    const env = this.resolve(name);
    if (!env) {
      throw new Error(`Undefined variable: ${name}`);
    }
    return env.values.get(name)!;
  }

  assign(name: string, value: number): void {
    const env = this.resolve(name);
    if (!env) {
      throw new Error(`Undefined variable: ${name}`);
    }
    if (!env.mutable.get(name)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    env.values.set(name, value);
  }

  child(): Environment {
    return new Environment(this);
  }

  private resolve(name: string): Environment | undefined {
    if (this.values.has(name)) {
      return this;
    }
    return this.parent?.resolve(name);
  }
}
