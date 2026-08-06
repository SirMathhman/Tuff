import type { Scope, Value } from "./types";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { evalAst } from "./evaluator";
import { toNum } from "./values";

// Module loader — evaluates modules against a shared scope with lazy
// cross-module loading, `out` exports, and circular-dependency detection.
export class ModuleLoader {
  private scopes: Scope[] = [{ vars: {}, mutable: {} }];
  private mutables: Scope["mutable"][] = [{}];
  private loaded = new Set<string>();
  private records: Record<string, Value> = {};

  constructor(private modules: Record<string, string>) {}

  // Load a module by name, returning its exports as a record value (or null if unknown).
  load(name: string): Value | null {
    if (name in this.records) return this.records[name]!;
    const source = this.modules[name];
    if (source === undefined) return null;
    if (this.loaded.has(name)) throw new Error(`circular module dependency: ${name}`);
    this.loaded.add(name);
    const exports: Record<string, Value> = {};
    const tokens = tokenize(source);
    const ast = parse(tokens);
    evalAst(ast, this.scopes, this.mutables, exports, (n) => this.load(n));
    const record = { tag: "record" as const, fields: exports };
    this.records[name] = record;
    return record;
  }

  // Evaluate an entry module's source and return its numeric result.
  evaluateEntry(name: string): number {
    const source = this.modules[name];
    if (source === undefined) throw new Error(`module not found: ${name}`);
    const exports: Record<string, Value> = {};
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const value = evalAst(ast, this.scopes, this.mutables, exports, (n) => this.load(n));
    return toNum(value);
  }
}
