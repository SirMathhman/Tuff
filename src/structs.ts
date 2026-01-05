import { Result, ok, err } from "./result";

export function checkDuplicateStructs(input: string): Result<void, string> {
  const structRe = /struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{[^}]*\}/gi;
  const names: string[] = [];
  for (const m of input.matchAll(structRe)) {
    names.push(m[1]);
  }
  const counts = new Map<string, number>();
  for (const n of names) {
    const cur = counts.get(n) || 0;
    counts.set(n, cur + 1);
    if (counts.get(n) === 2) return err("Duplicate binding");
  }
  return ok(undefined);
}

export function handleStructDeclaration(
  input: string
): Result<number, string> | undefined {
  const structMatch = input.match(
    /^\s*struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}\s*$/i
  );
  if (!structMatch) return undefined;
  const fieldsStr = structMatch[2].trim();
  if (fieldsStr.length === 0) return ok(0);

  const items = fieldsStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Map<string, number>();
  const allowedTypes = new Set(["i32", "i64", "bool"]);

  for (const it of items) {
    const m = it.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/
    );
    if (!m) return err("Invalid field declaration");
    const fname = m[1];
    const ftype = m[2];
    const cur = seen.get(fname) || 0;
    seen.set(fname, cur + 1);
    if (seen.get(fname) === 2) return err("Duplicate field");
    if (!allowedTypes.has(ftype.toLowerCase()))
      return err(`Unknown type: ${ftype}`);
  }

  return ok(0);
}
