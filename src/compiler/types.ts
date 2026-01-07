export interface VarDeclaration {
  mut: boolean;
  type?: string;
  initialized?: boolean; // whether the declaration included an initializer (e.g., `let x = ...`)
}

export interface ParseStructsResult {
  code: string;
  structs: Map<string, string[]>;
}

export interface ParseFunctionsResult {
  code: string;
  error?: string;
  funcParamTypes?: Map<string, string[]>;
  funcParamNames?: Map<string, string[]>;
}

export interface ParamListResult {
  names?: string[];
  types?: string[];
  duplicate?: string;
}

export interface ParseDeclarationsResult {
  decls: Map<string, VarDeclaration>;
  error?: string;
}

export interface ParsedArrayType {
  inner: string;
  parts: string[];
}
