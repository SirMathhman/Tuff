import type { Scope, TypeEnv, Value } from "./types";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { evalAst } from "./evaluator";
import { analyze, newTypeEnv } from "./analyzer";
import { toNum } from "./values";

// Module loader — evaluates modules against a shared scope with lazy
// cross-module loading, `out` exports, input variables, and circular-dependency detection.
export class ModuleLoader {
  private scopes: Scope[] = [{ vars: {}, mutable: {} }];
  private mutables: Scope["mutable"][] = [{}];
  private loaded = new Set<string>();
  private records: Record<string, Value> = {};
  private typeEnvs = new Map<string, TypeEnv>();

  constructor(private modules: Record<string, string>) {}

  // The set of all known module names (for analyzer module awareness).
  private moduleNames(): Set<string> {
    return new Set(Object.keys(this.modules));
  }

  // Parse + analyze a module source once, caching its TypeEnv.
  private analyzeSource(name: string): TypeEnv {
    let typeEnv = this.typeEnvs.get(name);
    if (!typeEnv) {
      const source = this.modules[name];
      if (source === undefined) throw new Error(`module not found: ${name}`);
      const ast = parse(tokenize(source));
      typeEnv = newTypeEnv();
      analyze(ast, typeEnv, { moduleNames: this.moduleNames() });
      this.typeEnvs.set(name, typeEnv);
    }
    return typeEnv;
  }

  // Load a module by name, returning its exports as a record value (or null if unknown).
  // `inputs` supplies values for the module's `in let` variables.
  load(name: string, inputs?: Record<string, Value>): Value | null {
    if (name in this.records && !inputs) return this.records[name]!;
    const source = this.modules[name];
    if (source === undefined) return null;
    if (this.loaded.has(name))
      throw new Error(`circular module dependency: ${name}`);
    this.loaded.add(name);
    const exports: Record<string, Value> = {};
    const typeEnv = this.analyzeSource(name);
    const tokens = tokenize(source);
    const ast = parse(tokens);
    evalAst(ast, {
      scopes: this.scopes,
      mutables: this.mutables,
      exports,
      typeEnv,
      moduleLoader: (n, i) => this.load(n, i),
      moduleInputs: inputs,
    });
    const record = { tag: "record" as const, fields: exports };
    if (!inputs) this.records[name] = record;
    return record;
  }

  // Evaluate an entry module's source and return its numeric result.
  evaluateEntry(name: string): number {
    const source = this.modules[name];
    if (source === undefined) throw new Error(`module not found: ${name}`);
    const exports: Record<string, Value> = {};
    const typeEnv = this.analyzeSource(name);
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const value = evalAst(ast, {
      scopes: this.scopes,
      mutables: this.mutables,
      exports,
      typeEnv,
      moduleLoader: (n, i) => this.load(n, i),
    });
    return toNum(value);
  }
}
