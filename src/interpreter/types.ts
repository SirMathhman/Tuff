export interface FunctionValue {
  params: string[];
  body: string;
  env: Env; // closure capture
}

export interface StructValue {
  fields: string[]; // field names in order
  values: number[]; // field values in order
}

export interface StructDef {
  name: string;
  fieldNames: string[];
  fieldTypes: string[];
}

export interface EnvItem {
  value: number | FunctionValue | StructValue;
  mutable: boolean;
  type?: string;
}

export type Env = Map<string, EnvItem>;
