// Type definitions for variable bindings
// Extracted to avoid circular dependencies with array-helpers.ts

export interface VariableBinding {
  name: string;
  memoryAddress: number;
  type?: string;
  mutable?: boolean;
  declarationOnly?: boolean;
  sourceArrayName?: string; // For slices: tracks which array they were derived from
  functionBody?: string; // For function variables: stores the function body
  functionParameters?: { name: string; type: string }[]; // For function variables: parameter info
}

export type VariableContext = VariableBinding[];
