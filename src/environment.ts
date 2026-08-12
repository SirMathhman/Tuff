import type { AstNode, TypeNode } from "./ast";
import type { IntTypeName } from "./types";

/** Discriminated union for all runtime values the language can produce. */
export type Value =
  | { kind: "number"; value: number; numType?: IntTypeName }
  | { kind: "bool"; value: boolean }
  | { kind: "ref"; ref: Ref }
  | { kind: "array"; elements: Value[] }
  | { kind: "range"; start: number; end: number }
  | { kind: "struct"; fields: Record<string, Value> }
  | { kind: "fnref"; fn: FnDef };

export type Ref = { name: string; env: Environment; mutable: boolean };

export type FnDef = {
  params: { name: string; type: TypeNode }[];
  returnType: TypeNode;
  body: AstNode;
};

/** Wrap a plain number in the Value union. */
export function num(v: number, numType?: IntTypeName): Value {
  return { kind: "number", value: v, numType };
}

/** Unwrap a Value to a number, throwing if it's not a number. */
export function toNumber(v: Value): number {
  if (v.kind === "number") return v.value;
  if (v.kind === "bool") return v.value ? 1 : 0;
  throw new Error(`Expected number, got ${v.kind}`);
}

/** Safely extract numType from a Value, returning undefined for non-number kinds. */
export function getNumberType(v: Value): IntTypeName | undefined {
  return v.kind === "number" ? v.numType : undefined;
}

export class Environment {
  private values: Record<string, Value> = {};
  private mutable: Set<string> = new Set();
  private functions: Record<string, FnDef> = {};
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

  declareFunction(name: string, fn: FnDef): void {
    this.functions[name] = fn;
  }

  getFunction(name: string): FnDef | undefined {
    if (Object.prototype.hasOwnProperty.call(this.functions, name)) {
      return this.functions[name];
    }
    if (this.parent) {
      return this.parent.getFunction(name);
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
