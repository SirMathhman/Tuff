import type {
  AssignStmt,
  BlockExpr,
  BreakStmt,
  Expr,
  FnDecl,
  IfExpr,
  LetDecl,
  LoopExpr,
  LoopStmt,
  Program,
  Stmt,
  ThisExpr,
} from "./ast";
import { Diagnostics } from "./diagnostics";

export function analyze(program: Program, diags: Diagnostics): void {
  const top = new NameEnv(diags, "<top>");
  const topBindings = new Bindings();
  for (const item of program.items) {
    analyzeTop(item as any, top, topBindings, diags);
  }
}

class NameEnv {
  readonly declared = new Set<string>();

  constructor(
    private readonly diags: Diagnostics,
    private readonly label: string,
    private readonly parent?: NameEnv
  ) {}

  declare(
    name: string,
    span: {
      filePath: string;
      start: number;
      end: number;
      line: number;
      col: number;
    }
  ) {
    // No shadowing anywhere: disallow if exists in any ancestor or descendant.
    // Implemented as: within a function/module env, a name must be globally unique.
    if (this.lookup(name)) {
      this.diags.error(
        `Cannot declare '${name}' here — name already exists in an enclosing scope`,
        span
      );
      return;
    }
    if (this.declared.has(name)) {
      this.diags.error(`Duplicate declaration of '${name}'`, span);
      return;
    }
    this.declared.add(name);
  }

  lookup(name: string): boolean {
    if (this.declared.has(name)) return true;
    return this.parent?.lookup(name) ?? false;
  }

  child(label: string): NameEnv {
    // children still must not declare existing parent names (shadowing), so link parent.
    return new NameEnv(this.diags, `${this.label}/${label}`, this);
  }

  allVisibleNames(): string[] {
    const names = new Set<string>();
    let cur: NameEnv | undefined = this;
    while (cur) {
      for (const n of cur.declared) names.add(n);
      cur = cur.parent;
    }
    return [...names].sort();
  }
}

type BindingInfo = { mutable: boolean };

class Bindings {
  private readonly map = new Map<string, BindingInfo>();
  constructor(private readonly parent?: Bindings) {}

  set(name: string, info: BindingInfo) {
    this.map.set(name, info);
  }

  get(name: string): BindingInfo | undefined {
    return this.map.get(name) ?? this.parent?.get(name);
  }

  child(): Bindings {
    return new Bindings(this);
  }
}

function analyzeTop(
  node: any,
  env: NameEnv,
  bindings: Bindings,
  diags: Diagnostics
) {
  switch (node.kind) {
    case "LetDecl":
      env.declare(node.name, node.span);
      bindings.set(node.name, { mutable: node.mutable });
      if (node.init) analyzeExpr(node.init, env, diags, bindings);
      return;
    case "FnDecl":
      if (node.name) env.declare(node.name, node.span);
      if (node.name) bindings.set(node.name, { mutable: false });
      analyzeFn(node, env, diags, bindings);
      return;
    case "TypeUnionDecl":
      env.declare(node.name, node.span);
      // variants become value-level constructors in our bootstrap emitter, so reserve them too
      for (const v of node.variants) {
        env.declare(v.name, node.span);
        bindings.set(v.name, { mutable: false });
      }
      return;
    case "ModuleDecl":
      env.declare(node.name, node.span);
      {
        const modEnv = env.child(`module:${node.name}`);
        const modBindings = bindings.child();
        for (const it of node.items)
          analyzeTop(it as any, modEnv, modBindings, diags);
      }
      return;
    case "ImportDecl":
    case "FromUseDecl":
    case "ExternFromUseDecl":
      // imports create local bindings for last path element or selected names
      if (node.kind === "ImportDecl") {
        const localName = node.modulePath[node.modulePath.length - 1];
        env.declare(localName, node.span);
        bindings.set(localName, { mutable: false });
      } else {
        for (const n of node.names) {
          env.declare(n, node.span);
          bindings.set(n, { mutable: false });
        }
      }
      return;
    default:
      // statements at top-level
      analyzeStmt(node as any, env, diags, bindings, {
        inLoopExpr: false,
        inWhile: false,
      });
  }
}

function analyzeFn(
  fn: FnDecl,
  outer: NameEnv,
  diags: Diagnostics,
  outerBindings: Bindings
) {
  const env = outer.child(`fn:${fn.name ?? "<anon>"}`);
  // Functions can capture outer bindings (closures).
  const bindings = outerBindings.child();
  for (const p of fn.params) {
    env.declare(p.name, p.span);
    bindings.set(p.name, { mutable: false });
  }
  // Scan body
  analyzeBlock(fn.body, env, diags, bindings, {
    inLoopExpr: false,
    inWhile: false,
  });

  // For class fn, ensure implicit yield this at end is possible; we check in emitter too.
}

function analyzeBlock(
  block: BlockExpr,
  env: NameEnv,
  diags: Diagnostics,
  bindings: Bindings,
  ctx: { inLoopExpr: boolean; inWhile: boolean }
) {
  const localEnv = env.child("block");
  const localBindings = bindings.child();

  for (const stmt of block.stmts) {
    analyzeStmt(stmt, localEnv, diags, localBindings, ctx);
  }
  if (block.tail) analyzeExpr(block.tail, localEnv, diags, localBindings, ctx);
}

function analyzeStmt(
  stmt: Stmt,
  env: NameEnv,
  diags: Diagnostics,
  bindings: Bindings,
  ctx: { inLoopExpr: boolean; inWhile: boolean }
) {
  switch (stmt.kind) {
    case "LetDecl": {
      env.declare(stmt.name, stmt.span);
      bindings.set(stmt.name, { mutable: stmt.mutable });
      if (stmt.init) analyzeExpr(stmt.init, env, diags, bindings, ctx);
      return;
    }
    case "AssignStmt": {
      analyzeAssign(stmt, env, diags, bindings, ctx);
      return;
    }
    case "ExprStmt": {
      analyzeExpr(stmt.expr, env, diags, bindings, ctx);
      return;
    }
    case "IfStmt": {
      analyzeExpr(stmt.cond, env, diags, bindings, ctx);
      analyzeBranch(stmt.thenBranch, env, diags, bindings, ctx);
      if (stmt.elseBranch)
        analyzeBranch(stmt.elseBranch as any, env, diags, bindings, ctx);
      return;
    }
    case "WhileStmt": {
      analyzeExpr(stmt.cond, env, diags, bindings, ctx);
      analyzeBranch(stmt.body, env, diags, bindings, { ...ctx, inWhile: true });
      return;
    }
    case "LoopStmt": {
      analyzeBranch(stmt.body, env, diags, bindings, ctx);
      return;
    }
    case "BreakStmt": {
      analyzeBreak(stmt, env, diags, bindings, ctx);
      return;
    }
    case "ContinueStmt":
      return;
    case "YieldStmt": {
      if (stmt.value) analyzeExpr(stmt.value, env, diags, bindings, ctx);
      return;
    }
    case "FnDecl": {
      // inner function declaration
      if (stmt.name) env.declare(stmt.name, stmt.span);
      if (stmt.name) bindings.set(stmt.name, { mutable: false });
      analyzeFn(stmt, env, diags, bindings);
      return;
    }
  }
}

function analyzeBranch(
  node: Stmt | BlockExpr,
  env: NameEnv,
  diags: Diagnostics,
  bindings: Bindings,
  ctx: { inLoopExpr: boolean; inWhile: boolean }
) {
  if ((node as any).kind === "BlockExpr") {
    analyzeBlock(node as BlockExpr, env, diags, bindings, ctx);
  } else {
    analyzeStmt(node as Stmt, env, diags, bindings, ctx);
  }
}

function analyzeAssign(
  stmt: AssignStmt,
  env: NameEnv,
  diags: Diagnostics,
  bindings: Bindings,
  ctx: { inLoopExpr: boolean; inWhile: boolean }
) {
  // only allow assignment to simple identifiers for now
  if (stmt.target.kind === "IdentExpr") {
    const info = bindings.get(stmt.target.name);
    if (!info) {
      diags.error(
        `Cannot assign to '${stmt.target.name}' — unknown binding`,
        stmt.span
      );
      return;
    }
    if (!info.mutable) {
      diags.error(
        `Cannot assign to immutable variable '${stmt.target.name}'`,
        stmt.span
      );
      return;
    }
  }
  analyzeExpr(stmt.expr, env, diags, bindings, ctx);
}

function analyzeBreak(
  stmt: BreakStmt,
  _env: NameEnv,
  diags: Diagnostics,
  bindings: Bindings,
  ctx: { inLoopExpr: boolean; inWhile: boolean }
) {
  if (stmt.value && ctx.inWhile) {
    diags.error(`'break <value>' is not allowed in 'while' loops`, stmt.span);
  }
  if (stmt.value && !ctx.inLoopExpr) {
    // We'll accept break values only in loop-expr lowering context.
    diags.error(
      `'break <value>' is only allowed in 'loop' expression contexts`,
      stmt.span
    );
  }
  if (stmt.value) analyzeExpr(stmt.value, _env, diags, bindings, ctx);
}

function analyzeExpr(
  expr: Expr,
  env: NameEnv,
  diags: Diagnostics,
  bindings: Bindings,
  ctx?: any
) {
  switch (expr.kind) {
    case "IdentExpr":
    case "LiteralExpr":
      return;
    case "PathExpr":
      return;
    case "UnaryExpr":
      analyzeExpr(expr.expr, env, diags, bindings, ctx);
      return;
    case "BinaryExpr":
      analyzeExpr(expr.left, env, diags, bindings, ctx);
      analyzeExpr(expr.right, env, diags, bindings, ctx);
      return;
    case "CallExpr":
      analyzeExpr(expr.callee, env, diags, bindings, ctx);
      for (const a of expr.args) analyzeExpr(a, env, diags, bindings, ctx);
      return;
    case "MemberExpr":
      analyzeExpr(expr.object, env, diags, bindings, ctx);
      return;
    case "IndexExpr":
      analyzeExpr(expr.object, env, diags, bindings, ctx);
      analyzeExpr(expr.index, env, diags, bindings, ctx);
      return;
    case "ParenExpr":
      analyzeExpr(expr.expr, env, diags, bindings, ctx);
      return;
    case "TupleLiteralExpr":
      for (const it of expr.items) analyzeExpr(it, env, diags, bindings, ctx);
      return;
    case "ObjectLiteralExpr":
      for (const f of expr.fields)
        analyzeExpr(f.value, env, diags, bindings, ctx);
      return;
    case "BlockExpr":
      analyzeBlock(
        expr,
        env,
        diags,
        bindings,
        ctx ?? { inLoopExpr: false, inWhile: false }
      );
      return;
    case "IfExpr": {
      analyzeExpr((expr as IfExpr).cond, env, diags, bindings, ctx);
      analyzeExpr((expr as IfExpr).thenExpr, env, diags, bindings, ctx);
      analyzeExpr((expr as IfExpr).elseExpr, env, diags, bindings, ctx);
      return;
    }
    case "LoopExpr": {
      // loop expression: within the body, break values are permitted
      analyzeBlock((expr as LoopExpr).body, env, diags, bindings, {
        inLoopExpr: true,
        inWhile: false,
      });
      // cheap check: require at least one break with value
      if (!containsBreakValue((expr as LoopExpr).body)) {
        diags.error(
          `Loop expression does not produce a value (missing 'break <value>')`,
          expr.span
        );
      }
      return;
    }
    case "MatchExpr": {
      analyzeExpr(expr.value, env, diags, bindings, ctx);
      for (const arm of expr.arms)
        analyzeExpr(arm.expr, env, diags, bindings, ctx);
      return;
    }
    case "ThisExpr": {
      const te = expr as ThisExpr;
      te.captureNames = env.allVisibleNames();
      return;
    }
    case "LambdaExpr": {
      const fnEnv = env.child("lambda");
      const fnBindings = bindings.child();
      for (const p of expr.params) {
        fnEnv.declare(p.name, p.span);
        fnBindings.set(p.name, { mutable: false });
      }
      analyzeBlock(expr.body, fnEnv, diags, fnBindings, {
        inLoopExpr: false,
        inWhile: false,
      });
      return;
    }
  }
}

function containsBreakValue(block: BlockExpr): boolean {
  const stack: any[] = [...block.stmts];
  if (block.tail) stack.push(block.tail);
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.kind === "BreakStmt" && n.value) return true;
    // recurse shallowly
    if (n.kind === "BlockExpr") {
      stack.push(...n.stmts);
      if (n.tail) stack.push(n.tail);
    }
    if (n.kind === "IfStmt") {
      stack.push(n.thenBranch, n.elseBranch, n.cond);
    }
    if (n.kind === "IfExpr") {
      stack.push(n.cond, n.thenExpr, n.elseExpr);
    }
    if (n.kind === "LoopStmt") stack.push(n.body);
    if (n.kind === "LoopExpr") stack.push(n.body);
    if (n.kind === "ExprStmt") stack.push(n.expr);
    if (n.kind === "AssignStmt") stack.push(n.target, n.expr);
    if (n.kind === "CallExpr") stack.push(n.callee, ...n.args);
    if (n.kind === "BinaryExpr") stack.push(n.left, n.right);
    if (n.kind === "UnaryExpr") stack.push(n.expr);
    if (n.kind === "MemberExpr") stack.push(n.object);
    if (n.kind === "IndexExpr") stack.push(n.object, n.index);
    if (n.kind === "MatchExpr") {
      stack.push(n.value, ...n.arms.map((a: any) => a.expr));
    }
    if (n.kind === "YieldStmt") stack.push(n.value);
  }
  return false;
}
