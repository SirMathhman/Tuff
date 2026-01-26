/**
 * Utility functions for detecting and validating dangling references
 */

export function validateBodyForDanglingRefs(
  body: string,
  paramNames: string[] | Set<string>,
  isCharIdentifier: (ch: string) => boolean,
  isWhitespaceFn: (ch: string) => boolean,
  throwFn: (msg: string) => void,
): void {
  const trimmed = body.trim();
  const paramSet = Array.isArray(paramNames) ? new Set(paramNames) : paramNames;
  const allVarsToCheck = new Set(paramSet);

  // Add local variables to the set
  let idx = 0;
  while (true) {
    const letIdx = trimmed.indexOf("let ", idx);
    if (letIdx === -1) break;

    let start = letIdx + 4;
    if (trimmed.startsWith("mut ", start)) start += 4;

    while (start < trimmed.length && isWhitespaceFn(trimmed[start]!)) start++;

    let end = start;
    while (end < trimmed.length && isCharIdentifier(trimmed[end]!)) {
      end++;
    }

    if (start < end) {
      allVarsToCheck.add(trimmed.slice(start, end));
    }

    idx = end;
  }

  // Check all variables for dangling references
  for (const varName of allVarsToCheck) {
    if (checkForDanglingRef(varName, trimmed, isCharIdentifier)) {
      throwFn(
        `cannot return reference to '${varName}': would create dangling pointer`,
      );
    }
  }
}

export function checkForDanglingRef(
  varName: string,
  body: string,
  isCharIdentifier: (ch: string) => boolean,
): boolean {
  let searchPos = 0;
  while (true) {
    const ampPos = body.indexOf("&" + varName, searchPos);
    if (ampPos === -1) return false;

    const afterVarPos = ampPos + 1 + varName.length;
    if (afterVarPos < body.length && isCharIdentifier(body[afterVarPos]!)) {
      searchPos = ampPos + 1;
      continue;
    }

    return true;
  }
}
