/** Discriminated union for all runtime values the language can produce. */
export type Value =
  | { kind: "number"; value: number }
  | { kind: "ref"; ref: Ref }
  | { kind: "array"; elements: Value[] }
  | { kind: "range"; start: number; end: number }
  | { kind: "struct"; fields: Record<string, Value> };

export type Ref = { name: string; env: Environment; mutable: boolean };

/** Wrap a plain number in the Value union. */
export function num(v: number): Value {
  return { kind: "number", value: v };
}

/** Unwrap a Value to a number, throwing if it's not a number. */
export function toNumber(v: Value): number {
  if (v.kind === "number") return v.value;
  throw new Error(`Expected number, got ${v.kind}`);
}

export class Environment {
  private values: Record<string, Value> = {};
  private mutable: Set<string> = new Set();
  private parent: Environment | undefined;

  constructor(parent?: Environment) {
    this.parent = parent;
  }

  declare(name: string, value: Value, mutable = false): void {
    this.values[name] = value;
    if (mutable) this.mutable.add(name);
  }

  assign(name: string, value: Value): void {
    if (!this.mutable.has(name)) {
      if (this.parent) {
        this.parent.assign(name, value);
        return;
      }
      throw new Error("Cannot assign to immutable variable: " + name);
    }
    this.values[name] = value;
  }

  get(name: string): Value | undefined {
    if (Object.prototype.hasOwnProperty.call(this.values, name)) {
      return this.values[name];
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    return undefined;
  }
}

function deref(ref: Ref): number {
  const val = ref.env.get(ref.name);
  if (val === undefined) throw new Error("Reference to undefined variable");
  if (val.kind === "ref") return deref(val.ref);
  return toNumber(val);
}

function assignRef(ref: Ref, value: number): void {
  if (!ref.mutable)
    throw new Error("Cannot assign through immutable reference");
  ref.env.assign(ref.name, num(value));
}

export { deref, assignRef };
