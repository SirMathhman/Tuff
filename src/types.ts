export type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export type Variable = { name: string; type: string; value: number | bigint; mutable: boolean };

export type FunctionParameter = { name: string; type: string };

export type FunctionDef = { name: string; parameters: FunctionParameter[]; returnType: string; body: string };

export type VariableScope = {
  variables: Map<string, Variable>;
  functions: Map<string, FunctionDef>;
  parent: VariableScope | null;
};

export type Range = { min: number | bigint; max: number | bigint; unsigned: boolean };

export const TYPE_RANGES: Record<string, Range> = {
  U8: { min: 0, max: 255, unsigned: true },
  U16: { min: 0, max: 65535, unsigned: true },
  U32: { min: 0, max: 4294967295, unsigned: true },
  U64: { min: 0n, max: 18446744073709551615n, unsigned: true },
  I8: { min: -128, max: 127, unsigned: false },
  I16: { min: -32768, max: 32767, unsigned: false },
  I32: { min: -2147483648, max: 2147483647, unsigned: false },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n, unsigned: false },
};

export const TYPE_ORDER: string[] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
