export function extractArguments(
  source: string,
  startIdx: number,
  len: number,
): { args: string; nextIdx: number } {
  let j = startIdx + 1;
  let args = "";
  let depth = 1;
  while (j < len && depth > 0) {
    const c = source.charAt(j);
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth > 0) args += c;
    j++;
  }
  return { args, nextIdx: j };
}

export function checkMethodValidity(
  methodName: string,
  result: string,
  moduleNames: Set<string>,
  builtinMethods: Set<string>,
  propertyAliases: Record<string, string>,
  findReceiverStart: (result: string, isClosing: boolean) => number,
): { type: string; alias?: string } | undefined {
  if (builtinMethods.has(methodName)) return { type: "builtin" };
  if (propertyAliases[methodName])
    return { type: "alias", alias: propertyAliases[methodName] };
  const isClosingResult = result.charAt(result.length - 1) === ")";
  const receiverStartCheck = findReceiverStart(result, isClosingResult);
  const receiverCheck = result.slice(receiverStartCheck).trim();
  if (moduleNames.has(receiverCheck)) return { type: "property" };
  return undefined;
}
