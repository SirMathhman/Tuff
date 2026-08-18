export interface Binding {
  value: number;
  mutable: boolean;
  /** When set, this binding is a reference to another variable. */
  refTo?: string;
}

export type Env = Map<string, Binding>;
