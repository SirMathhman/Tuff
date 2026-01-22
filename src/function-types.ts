// Type definitions for function support
// Functions have parameters, a return type, and a body

export interface FunctionParameter {
  name: string;
  type: string;
}

export interface FunctionBinding {
  name: string;
  parameters: FunctionParameter[];
  returnType: string;
  body: string; // The expression to evaluate
}

export type FunctionContext = FunctionBinding[];
