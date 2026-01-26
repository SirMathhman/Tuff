export type FnDef = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
  generics?: string[];
};

export const functionDefs = new Map<string, FnDef>();

const functionRefs = new Map<string, string>();
export const setFunctionRef = (varName: string, fnName: string) =>
  functionRefs.set(varName, fnName);
export const getFunctionRef = (varName: string) => functionRefs.get(varName);

// Track current function context for 'this' support
export let currentFunctionParams:
  | Array<{ name: string; value: number }>
  | undefined;
export const setCurrentFunctionParams = (
  params: Array<{ name: string; value: number }> | undefined,
) => {
  currentFunctionParams = params;
};
