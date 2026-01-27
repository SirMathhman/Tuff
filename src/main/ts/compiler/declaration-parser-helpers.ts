export interface VariableInfo {
  type: string | undefined;
  mutable: boolean;
  initialized: boolean;
  isArray?: boolean;
  isUninitialized?: boolean;
  isOut?: boolean;
  isParameter?: boolean;
}

export function registerVariable(
  varName: string,
  typeAnnotation: string | undefined,
  isMutable: boolean,
  variables: Map<string, VariableInfo>,
  isArray?: boolean,
  hasInitializer?: boolean,
  inferredType?: string,
  isOut?: boolean,
  isParameter?: boolean,
): void {
  if (variables.has(varName)) {
    throw new Error(`Variable '${varName}' already declared`);
  }
  const isUninitialized = hasInitializer === false;
  const effectiveType = typeAnnotation || inferredType;
  variables.set(varName, {
    type: effectiveType,
    mutable: isMutable,
    initialized: !isUninitialized,
    isArray,
    isUninitialized,
    isOut,
    isParameter,
  });
}
