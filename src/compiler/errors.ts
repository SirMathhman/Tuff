export function makeDuplicateError(kind: string, name: string): string {
  return `(function(){ throw new Error("duplicate ${kind} '${name}'"); })()`;
}

export function makeTypeError(
  func: string,
  param: string,
  expected: string,
  actual: string
): string {
  return `(function(){ throw new Error("type mismatch in call to '${func}': parameter '${param}' expected ${expected} but got ${actual}"); })()`;
}
