export class Environment {
  private values: Record<string, number | Ref> = {};
  private mutable: Set<string> = new Set();
  private parent: Environment | undefined;

  constructor(parent?: Environment) {
    this.parent = parent;
  }

  declare(name: string, value: number | Ref, mutable = false): void {
    this.values[name] = value;
    if (mutable) this.mutable.add(name);
  }

  assign(name: string, value: number | Ref): void {
    if (!this.mutable.has(name)) {
      if (this.parent) {
        this.parent.assign(name, value);
        return;
      }
      throw new Error("Cannot assign to immutable variable: " + name);
    }
    this.values[name] = value;
  }

  get(name: string): number | Ref | undefined {
    if (Object.prototype.hasOwnProperty.call(this.values, name)) {
      return this.values[name];
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    return undefined;
  }
}

type Ref = { name: string; env: Environment; mutable: boolean };

function deref(ref: Ref): number {
  const val = ref.env.get(ref.name);
  if (val === undefined) throw new Error("Reference to undefined variable");
  if (typeof val === "object") return deref(val);
  return val;
}

function assignRef(ref: Ref, value: number): void {
  if (!ref.mutable)
    throw new Error("Cannot assign through immutable reference");
  ref.env.assign(ref.name, value);
}

export type { Ref };
export { deref, assignRef };
