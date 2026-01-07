import type { VarDeclaration } from "./types";
import type { ParseStructsResult } from "./types";

export function parseStructs(input: string): ParseStructsResult {
  const structRegex =
    /struct\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\{\s*([^}]*)\s*\}/g;
  const structs = new Map<string, string[]>();
  let out = input;
  let m: RegExpExecArray | undefined;
  while (
    (m = structRegex.exec(input) as unknown as RegExpExecArray | undefined)
  ) {
    const name = m[1];
    const body = m[2];
    const fields = body
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((f) => {
        const fm = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*/.exec(f);
        return fm ? fm[1] : "";
      })
      .filter(Boolean);
    structs.set(name, fields);
    out = out.replace(m[0], "");
  }
  return { code: out, structs };
}

export function applyStringAndCtorTransforms(
  replaced: string,
  structs: Map<string, string[]>,
  decls: Map<string, VarDeclaration>
): string {
  // Convert char literals like 'a' -> ('a').charCodeAt(0) so they behave as numeric Char
  // Supports escaped chars such as '\n' via the capture
  replaced = replaced.replace(/'([^'\\]|\\.)'/g, "('$1').charCodeAt(0)");

  // Convert string literal indexing "foo"[0] -> ("foo").charCodeAt(0)
  replaced = replaced.replace(
    /"((?:[^"\\]|\\.)*)"\s*\[\s*(\d+)\s*\]/g,
    (_m, inner, idx) => `(${JSON.stringify(inner)}).charCodeAt(${idx})`
  );

  // Replace constructor calls like `Point { expr, expr }` with object literals
  for (const [name, fields] of structs.entries()) {
    const ctorRegex = new RegExp("\\b" + name + "\\s*\\{([^}]*)\\}", "g");
    replaced = replaced.replace(ctorRegex, (_m, inner) => {
      const args = inner
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const pairs = fields.map((f, i) => `${f}: ${args[i] ?? "undefined"}`);
      return `({ ${pairs.join(", ")} })`;
    });
  }

  // Pointer support
  // Replace mutable address-of: `&mut x` -> {get:()=>x, set:(v)=>{x=v}}
  replaced = replaced.replace(
    /(?<!&)&\s*mut\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    "({get:()=>$1, set:(v)=>{ $1 = v }})"
  );

  // Replace pointer address-of: `&x` -> {get:()=>x, set:(v)=>{x=v}}
  replaced = replaced.replace(
    /(?<!&)&\s*([A-Za-z_$][A-Za-z0-9_$]*)/g,
    "({get:()=>$1, set:(v)=>{ $1 = v }})"
  );

  // Replace pointer assignment `*y = expr` -> `y.set(expr)`
  replaced = replaced.replace(
    /(?<![A-Za-z0-9_)\]"])\*\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;\n]+)/g,
    (_m, ident, rhs) => `${ident}.set(${rhs.trim()})`
  );

  // Replace deref use `*y` (unary) -> `y.get()` -- avoid matching multiplication by ensuring star is not binary
  replaced = replaced.replace(
    /(?<![A-Za-z0-9_)\]"])\*\s*([A-Za-z_$][A-Za-z0-9_$]*)/g,
    "$1.get()"
  );

  // If any variable is declared as `: &Str`, convert occurrences like `x[0]` to `x.charCodeAt(0)`
  for (const [name, info] of decls.entries()) {
    if (info.type === "&Str") {
      const idxRegex = new RegExp(
        "\\b" + name + "\\s*\\[\\s*(\\d+)\\s*\\]",
        "g"
      );
      replaced = replaced.replace(idxRegex, `${name}.charCodeAt($1)`);
    }
  }

  return replaced;
}
