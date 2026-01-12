export interface FunctionValue {
  params: string[];
  body: string;
  env: Env; // closure capture
}

export interface ArrayValue {
  type: "Array";
  elementType: string;
  elements: number[];
  length: number;
  initializedCount: number;
}

export interface SliceValue {
  type: "Slice";
  elementType: string;
  backing: ArrayValue;
  start: number;
  length: number;
  mutable?: boolean;
}

export interface PointerValue {
  type: "Pointer";
  env: Env;
  name: string;
  pointeeType?: string;
  pointeeMutable?: boolean;
}

export interface StructValue {
  fields: string[]; // field names in order
  values: number[]; // field values in order
  // Optional instance methods defined on this struct (name -> FunctionValue)
  methods?: Map<string, FunctionValue>;
}

export interface StructDef {
  name: string;
  fieldNames: string[];
  fieldTypes: string[];
}

export interface EnvItem {
  value:
    | number
    | FunctionValue
    | StructValue
    | ArrayValue
    | PointerValue
    | SliceValue;
  mutable: boolean;
  type?: string;
  // Linear type support: when true, this binding has been moved out and can no
  // longer be referenced until it is assigned a new value.
  moved?: boolean;
}

export type Env = Map<string, EnvItem>;
