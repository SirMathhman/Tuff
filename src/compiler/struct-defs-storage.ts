/**
 * Store for struct type information collected during compilation
 */
export interface CompileStructDef {
  fields: Map<string, string>; // fieldName -> fieldType
  generics?: string[]; // generic type parameters like ["T"] or ["A", "B"]
}

const compileStructDefs = new Map<string, CompileStructDef>();

export function getCompileStructDefs(): Map<string, CompileStructDef> {
  return compileStructDefs;
}

export function setCompileStructDef(
  structName: string,
  fields: Map<string, string>,
  generics?: string[],
): void {
  compileStructDefs.set(structName, { fields, generics });
}

export function clearCompileStructDefs(): void {
  compileStructDefs.clear();
}
