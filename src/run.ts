/**
 * Compile a string into JavaScript source that evaluates to a number
 */

interface VarDeclaration {
  mut: boolean;
}

function replaceReads(input: string): string {
  const readI32Regex = /read<\s*I32\s*>\s*\(\s*\)/g;
  let out = input.replace(readI32Regex, "readI32()");
  const readBoolRegex = /read<\s*Bool\s*>\s*\(\s*\)/g;
  out = out.replace(readBoolRegex, "readBool()");
  return out;
}

interface ParseStructsResult {
  code: string;
  structs: Map<string, string[]>;
}

function parseStructs(input: string): ParseStructsResult {
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

interface ParseFunctionsResult {
  code: string;
  error?: string;
}

// Convert `fn name(params) : Type => { ... }` into JS function declarations
function parseFunctions(input: string): ParseFunctionsResult {
  const fnRegex =
    /fn\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*[A-Za-z_$][A-Za-z0-9_$]*)?\s*=>\s*\{([\s\S]*?)\}/g;
  let out = input;
  const names = new Set<string>();
  let m: RegExpExecArray | undefined;
  while ((m = fnRegex.exec(input) as unknown as RegExpExecArray | undefined)) {
    const name = m[1];
    const params = m[2];
    const body = m[3];
    if (names.has(name)) {
      return {
        code: input,
        error: `(function(){ throw new Error("duplicate function declaration '${name}'"); })()`,
      };
    }
    names.add(name);

    const paramList = params
      .split(",")
      .map((p: string) => p.trim())
      .filter(Boolean)
      .map((p: string) => {
        const pm = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(p);
        return pm ? pm[1] : "";
      })
      .filter(Boolean)
      .join(", ");

    const transformedBody = body.replace(/\byield\b/g, "return");
    const replacement = `const ${name} = function(${paramList}) { ${transformedBody} };`;
    out = out.replace(m[0], replacement);
  }
  return { code: out };
}

interface ParseDeclarationsResult {
  decls: Map<string, VarDeclaration>;
  error?: string;
}

function parseDeclarations(input: string): ParseDeclarationsResult {
  const declRegex = /\blet\s+(mut\s+)?([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const decls = new Map<string, VarDeclaration>();
  let m: RegExpExecArray | undefined;
  while (
    (m = declRegex.exec(input) as unknown as RegExpExecArray | undefined)
  ) {
    const varName = m[2];
    if (decls.has(varName)) {
      return {
        decls,
        error: `(function(){ throw new Error("duplicate variable declaration '${varName}'"); })()`,
      };
    }
    decls.set(varName, { mut: !!m[1] });
  }
  return { decls };
}

function stripAnnotationsAndMut(replaced: string): string {
  replaced = replaced.replace(/:\s*(?:I32|Bool)\b/g, "");
  replaced = replaced.replace(/\b(let|var|const)\s+mut\b/g, "$1");
  return replaced;
}

function checkImmutableAssignments(
  replaced: string,
  decls: Map<string, VarDeclaration>
): string | undefined {
  if (decls.size === 0) return undefined;
  const withoutDecls = replaced.replace(/\blet\b[^;]*;/g, "");
  for (const [name, info] of decls.entries()) {
    if (!info.mut) {
      const assignRegex = new RegExp("\\b" + name + "\\s*=");
      if (assignRegex.test(withoutDecls)) {
        return `(function(){ throw new Error("assignment to immutable variable '${name}'"); })()`;
      }
    }
  }
  return undefined;
}

function wrapStatements(code: string): string {
  const parts = code
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "(0)";
  if (parts.length === 1) return parts[0];

  const last = parts.pop();
  const body = parts.join("; ");
  return `(function(){ ${body}; return (${last}); })()`;
}

export function compile(input: string): string {
  // Normalize input
  const trimmed = input.trim();

  // Extract and remove struct declarations first
  const structParsed = parseStructs(trimmed);
  let codeNoStructs = structParsed.code;
  const structs = structParsed.structs;

  // Transform `fn` declarations to JS functions before replacing reads
  const fnParsed = parseFunctions(codeNoStructs);
  if (fnParsed.error) return fnParsed.error;
  codeNoStructs = fnParsed.code;

  let replaced = replaceReads(codeNoStructs);

  const parsed = parseDeclarations(codeNoStructs);
  if (parsed.error) return parsed.error;
  const decls = parsed.decls;

  const hasRead =
    replaced.indexOf("readI32()") !== -1 ||
    replaced.indexOf("readBool()") !== -1;

  replaced = stripAnnotationsAndMut(replaced);

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

  const assignError = checkImmutableAssignments(replaced, decls);
  if (assignError) return assignError;

  if (hasRead) {
    if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
      return wrapStatements(replaced);
    }

    return replaced;
  }

  // If the input contains multiple statements (semicolon or declarations),
  // wrap it in an IIFE that returns the last expression so it can be
  // evaluated as a single expression by `run`.
  if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
    return wrapStatements(replaced);
  }

  // Fallback: return as an expression (e.g., length-based behavior for plain strings)
  return `(${trimmed.length})`;
}

/**
 * run - takes a string and returns a number
 * Implementation: compile the input to JS, eval it, and return the result.
 */
export function run(input: string, stdin: string = ""): number {
  // Call the exported `compile` to allow runtime spies/mocks to intercept it.
  // Use NodeJS.Module type to satisfy ESLint's no-explicit-any.
  const compiledExpr = (exports as NodeJS.Module["exports"]).compile(input);

  // Wrap the compiled expression in an IIFE so we can inject `stdin` into
  // the evaluation scope. JSON.stringify is used to safely embed the stdin
  // string literal. We also provide `readI32` and `readBool` helpers that
  // consume tokens from `stdin` (split on whitespace) so expressions like
  // "read<I32>() + read<Bool>()" work as expected.
  const code = `(function(){ const stdin = ${JSON.stringify(
    stdin
  )}; const args = stdin.trim() ? stdin.trim().split(/\\s+/) : []; let __readIndex = 0; function readI32(){ return parseInt(args[__readIndex++], 10); } function readBool(){ const val = args[__readIndex++]; return val === 'true' ? 1 : 0; } return (${compiledExpr}); })()`;

  const result = eval(code);
  return Number(result);
}
