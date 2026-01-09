/**
 * Centralized error catalog for the Tuff interpreter.
 * All error messages are defined here to eliminate duplication and provide consistency.
 */

export enum ErrorCode {
  INVALID_FIELD_ACCESS = "INVALID_FIELD_ACCESS",
  CANNOT_ACCESS_FIELD = "CANNOT_ACCESS_FIELD",
  CANNOT_ACCESS_FIELD_MISSING = "CANNOT_ACCESS_FIELD_MISSING",
  CANNOT_INDEX_NON_ARRAY = "CANNOT_INDEX_NON_ARRAY",
  OUT_OF_RANGE_U = "OUT_OF_RANGE_U",
  OUT_OF_RANGE_I = "OUT_OF_RANGE_I",
  INDEX_OUT_OF_RANGE = "INDEX_OUT_OF_RANGE",
  USE_OF_UNINITIALIZED = "USE_OF_UNINITIALIZED",
  INVALID_SYNTAX = "INVALID_SYNTAX",
  UNBALANCED_PARENS = "UNBALANCED_PARENS",
  UNBALANCED_BRACES = "UNBALANCED_BRACES",
  MISSING_BODY = "MISSING_BODY",
}

export interface ErrorDefinition {
  code: ErrorCode;
  // eslint-disable-next-line no-restricted-syntax
  format: (params?: Record<string, string | number>) => string;
}

// Helper to create error definition with consistent structure
function makeErrorDef(
  code: ErrorCode,
  // eslint-disable-next-line no-restricted-syntax
  format: (params?: Record<string, string | number>) => string
): ErrorDefinition {
  return { code, format };
}

// eslint-disable-next-line no-restricted-syntax
export const ERROR_CATALOG: Record<ErrorCode, ErrorDefinition> = {
  [ErrorCode.INVALID_FIELD_ACCESS]: makeErrorDef(
    ErrorCode.INVALID_FIELD_ACCESS,
    ({ fieldName } = {}) => `invalid field access: ${fieldName}`
  ),
  [ErrorCode.CANNOT_ACCESS_FIELD]: makeErrorDef(
    ErrorCode.CANNOT_ACCESS_FIELD,
    () => `cannot access field on non-struct value`
  ),
  [ErrorCode.CANNOT_ACCESS_FIELD_MISSING]: makeErrorDef(
    ErrorCode.CANNOT_ACCESS_FIELD_MISSING,
    () => `cannot access field on missing value`
  ),
  [ErrorCode.CANNOT_INDEX_NON_ARRAY]: makeErrorDef(
    ErrorCode.CANNOT_INDEX_NON_ARRAY,
    () => `cannot index non-array value`
  ),
  [ErrorCode.OUT_OF_RANGE_U]: makeErrorDef(
    ErrorCode.OUT_OF_RANGE_U,
    ({ bits } = {}) => `value out of range for U${bits}`
  ),
  [ErrorCode.OUT_OF_RANGE_I]: makeErrorDef(
    ErrorCode.OUT_OF_RANGE_I,
    ({ bits } = {}) => `value out of range for I${bits}`
  ),
  [ErrorCode.INDEX_OUT_OF_RANGE]: makeErrorDef(
    ErrorCode.INDEX_OUT_OF_RANGE,
    () => `index out of range`
  ),
  [ErrorCode.USE_OF_UNINITIALIZED]: makeErrorDef(
    ErrorCode.USE_OF_UNINITIALIZED,
    () => `use of uninitialized array element`
  ),
  [ErrorCode.INVALID_SYNTAX]: makeErrorDef(
    ErrorCode.INVALID_SYNTAX,
    ({ type } = {}) => `invalid ${type} syntax`
  ),
  [ErrorCode.UNBALANCED_PARENS]: makeErrorDef(
    ErrorCode.UNBALANCED_PARENS,
    ({ type } = {}) => `unbalanced parentheses in ${type}`
  ),
  [ErrorCode.UNBALANCED_BRACES]: makeErrorDef(
    ErrorCode.UNBALANCED_BRACES,
    ({ type } = {}) => `unbalanced braces in ${type}`
  ),
  [ErrorCode.MISSING_BODY]: makeErrorDef(
    ErrorCode.MISSING_BODY,
    ({ type } = {}) => `missing ${type} body`
  ),
};

export function throwError(
  code: ErrorCode,
  // eslint-disable-next-line no-restricted-syntax
  params: Record<string, string | number> = {}
): never {
  const def = ERROR_CATALOG[code];
  throw new Error(def.format(params));
}
