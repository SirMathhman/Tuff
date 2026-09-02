export function compileTuffToTypeScript(tuffSource: string): string {
  const expr = extractExpression(tuffSource);
  if (expr === "") {
    return "process.exit(0);";
  }
  return `process.exit(${expr});`;
}

function extractExpression(source: string): string {
  const lines = source.split("\n");
  const exprLines: string[] = [];
  let inModule = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inModule) {
      braceDepth += (trimmed.match(/\{/g) || []).length;
      braceDepth -= (trimmed.match(/\}/g) || []).length;
      if (braceDepth <= 0) inModule = false;
      continue;
    }

    if (trimmed.startsWith("module ")) {
      inModule = true;
      braceDepth =
        (trimmed.match(/\{/g) || []).length -
        (trimmed.match(/\}/g) || []).length;
      continue;
    }
    if (trimmed.startsWith("declare ")) continue;
    if (trimmed.startsWith("in let ")) continue;

    exprLines.push(line);
  }

  return exprLines.join("\n").trim();
}
