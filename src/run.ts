import { compileImpl, compileProgramImpl } from "./compiler/compile";
import vm from "node:vm";

export function compile(input: string): string {
  return compileImpl(input);
}

export interface CompileBundleOptions {
  /**
   * Root folder for Java-like packages. For example, if `modules` is the root,
   * then `from tuff::stuff use { ... }` resolves to `${modulesRoot}/tuff/stuff/provider.tuff`.
   *
   * If omitted, this is inferred from the `entry` path when it contains `/modules/`.
   */
  modulesRoot?: string;
}

interface ParsedModuleSyntax {
  code: string;
  imports: string[];
}

interface BundleOrderResult {
  order: string[];
  parsed: Map<string, ParsedModuleSyntax>;
}

function normalizeId(id: string): string {
  return id.replace(/\\/g, "/");
}

function providerIdFor(moduleSpec: string, modulesRoot: string): string {
  const rel = moduleSpec.split("::").join("/");
  return `${modulesRoot}/${rel}/provider.tuff`;
}

function namespaceToIds(ns: Namespace, mr: string): string[] {
  const base = `${mr}/${ns.join("/")}`;
  return [normalizeId(`${base}.tuff`), normalizeId(`${base}/provider.tuff`)];
}

function normalizeNamespaceFiles(
  filesMap: Map<Namespace, string>,
  mr: string
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ns, src] of filesMap.entries()) {
    const [id1, id2] = namespaceToIds(ns, mr);
    if (!out.has(id1)) out.set(id1, src);
    if (!out.has(id2)) out.set(id2, src);
  }
  return out;
}

function buildPrelude(
  orderList: string[],
  entryKey: string,
  parsedMap: Map<string, ParsedModuleSyntax>,
  fileMap: Map<string, string>
): string {
  let out = "";
  for (const id of orderList) {
    if (id === entryKey) continue;
    const code = parsedMap.get(id)?.code ?? fileMap.get(id) ?? "";
    const compiled = compileProgramImpl(code);
    out += `\n// ${id}\n${compiled}\n`;
  }
  return out;
}

function stripModuleSyntax(src: string): ParsedModuleSyntax {
  const imports: string[] = [];
  const importStmt =
    /^\s*from\s+([A-Za-z_$][A-Za-z0-9_$]*(?:::[A-Za-z_$][A-Za-z0-9_$]*)*)\s+use\s+\{[^}]*\}\s*;\s*$/gm;

  let code = src.replace(importStmt, (_m, mod: string) => {
    imports.push(mod);
    return "";
  });

  // Strip `out` from declarations so they compile to valid JS.
  code = code.replace(/\bout\s+(fn|let|struct)\b/g, "$1");

  // Remove simple `extern` declarations (e.g., `extern from length(this: String): USize;`)
  // These are used for host-provided functions and don't affect bundling.
  code = code.replace(/^\s*extern\b.*;\s*$/gm, "");

  return { code, imports };
}

function buildBundleOrder(
  entryId: string,
  files: Map<string, string>,
  modulesRoot: string
): BundleOrderResult {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  const parsed = new Map<string, ParsedModuleSyntax>();

  const getParsed = (id: string): ParsedModuleSyntax => {
    const existing = parsed.get(id);
    if (existing) return existing;

    const src = files.get(id);
    if (src === undefined) throw new Error(`missing source for '${id}'`);
    const p = stripModuleSyntax(src);
    parsed.set(id, p);
    return p;
  };

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id))
      throw new Error(`cyclic module dependency at '${id}'`);
    visiting.add(id);

    const p = getParsed(id);
    for (const mod of p.imports) {
      const providerId = providerIdFor(mod, modulesRoot);
      if (!files.has(providerId)) {
        throw new Error(
          `missing provider module '${providerId}' (imported from '${id}')`
        );
      }
      visit(providerId);
    }

    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };

  visit(entryId);
  return { order, parsed };
}

/**
 * compileBundle - compile multiple `.tuff` files into a single JS *expression*
 * string. The resulting expression evaluates to the entry module's result.
 */
export type Namespace = string[];

export function compileBundle(
  files: Map<Namespace, string>,
  entry: Namespace,
  options: CompileBundleOptions = {}
): string {
  // Decide modulesRoot early; we no longer infer from a file path string.
  const modulesRoot =
    options.modulesRoot !== undefined
      ? normalizeId(options.modulesRoot)
      : "modules";

  const normalizedFiles = normalizeNamespaceFiles(files, modulesRoot);

  const [entryId1, entryId2] = namespaceToIds(entry, modulesRoot);
  const entryId = normalizedFiles.has(entryId1)
    ? entryId1
    : normalizedFiles.has(entryId2)
    ? entryId2
    : undefined;

  if (!entryId) {
    throw new Error(`entry namespace '${entry.join("::")}' not found in files map`);
  }

  const { order, parsed } = buildBundleOrder(entryId, normalizedFiles, modulesRoot);

  const prelude = buildPrelude(order, entryId, parsed, normalizedFiles);
  const entryCode = parsed.get(entryId)?.code ?? normalizedFiles.get(entryId) ?? "";
  const entryExpr = compileImpl(entryCode);

  return `(function(){${prelude}\nreturn (${entryExpr});\n})()`;
}

/**
 * run - takes a string and returns a number
 * Implementation: compile the input to JS, eval it, and return the result.
 */
export function run(
  input: string,
  stdin: string = "",
  timeoutMs: number = 1000
): number {
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

  // Use vm timeout to prevent pathological/infinite compiled programs from
  // hanging the entire Jest process.
  const result = vm.runInNewContext(code, {}, { timeout: timeoutMs });
  return Number(result);
}
