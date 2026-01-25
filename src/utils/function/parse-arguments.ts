export function parseArguments(argsStr: string): string[] {
  if (!argsStr) return [];
  const argParts: string[] = [];
  let current = "",
    parenD = 0,
    braceD = 0;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === "(") parenD++;
    else if (ch === ")") parenD--;
    else if (ch === "{") braceD++;
    else if (ch === "}") braceD--;
    else if (ch === "," && parenD === 0 && braceD === 0) {
      argParts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) argParts.push(current.trim());
  return argParts;
}
