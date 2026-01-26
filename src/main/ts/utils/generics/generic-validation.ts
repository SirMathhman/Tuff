import { inferValueType } from "./type-inference";

/**
 * Shared generic type validation logic for both compiler and interpreter
 */
export function validateGenericTypeConsistency(
  typeMapping: Map<string, string>,
  paramTypeStr: string,
  concreteType: string | undefined,
): void {
  // Skip if we can't infer the type
  if (concreteType === undefined) {
    return;
  }

  // Check consistency: if we've already mapped this generic param, verify it matches
  const existingType = typeMapping.get(paramTypeStr);
  if (existingType) {
    if (existingType !== concreteType) {
      throw new Error(
        `Generic type parameter '${paramTypeStr}' is used with conflicting types: '${existingType}' and '${concreteType}'`,
      );
    }
  } else {
    typeMapping.set(paramTypeStr, concreteType);
  }
}

/**
 * Get the concrete type for a parameter by inferring from argument
 */
export function getConcreteType(argStr: string): string | undefined {
  return inferValueType(argStr);
}
