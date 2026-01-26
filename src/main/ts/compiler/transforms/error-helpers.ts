/**
 * Throw a field type mismatch error (used in both compiler and interpreter)
 */
export function throwFieldTypeMismatch(
  fieldName: string,
  resolvedType: string,
  fieldValue: string,
): never {
  throw new Error(
    `Struct field '${fieldName}' expects type ${resolvedType}, but got ${fieldValue}`,
  );
}
