// Type definitions for variable bindings
// Extracted to avoid circular dependencies with array-helpers.ts

export interface VariableBinding {
  name: string;
  memoryAddress: number;
  type?: string;
  mutable?: boolean;
  declarationOnly?: boolean;
}

export type VariableContext = VariableBinding[];
