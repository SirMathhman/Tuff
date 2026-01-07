function makeThrowErrorExpr(message: string): string {
  return `(function(){ throw new Error("${message}"); })()`;
}

export function makeDuplicateError(kind: string, name: string): string {
  return makeThrowErrorExpr(`duplicate ${kind} '${name}'`);
}

export function makeTypeError(
  func: string,
  param: string,
  expected: string,
  actual: string
): string {
  return `(function(){ throw new Error("type mismatch in call to '${func}': parameter '${param}' expected ${expected} but got ${actual}"); })()`;
}

export function makeDuplicateParamError(param: string, funcName: string): string {
  return makeThrowErrorExpr(
    `duplicate parameter name '${param}' in function '${funcName}'`
  );
}
