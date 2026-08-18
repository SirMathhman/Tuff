/** The type of a runtime value. Booleans and numbers are distinct. */
export type ValueKind = "num" | "bool";

export interface Value {
  kind: ValueKind;
  /** Numeric representation: the number itself, or 1/0 for booleans. */
  num: number;
}

export interface Binding {
  value: Value;
  mutable: boolean;
  /** When set, this binding is a reference to another variable. */
  refTo?: string;
}

export type Env = Map<string, Binding>;
