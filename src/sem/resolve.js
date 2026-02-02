"use strict";

const { Scope } = require("./scope");

function resolveProgram(program) {
  const ctx = {
    scope: new Scope(null),
    enums: new Map(),
    structs: new Map(),
    errors: [],
    loopDepth: 0,
  };

  for (const item of program.items) {
    if (item.type === "StructDecl") {
      ctx.structs.set(item.name, item);
      const res = ctx.scope.declare(item.name, { kind: "struct", node: item });
      if (!res.ok) ctx.errors.push(res.message);
    }
    if (item.type === "EnumDecl") {
      ctx.enums.set(item.name, item.variants.slice());
      const res = ctx.scope.declare(item.name, { kind: "enum", node: item });
      if (!res.ok) ctx.errors.push(res.message);
    }
    if (item.type === "FnDecl") {
      const res = ctx.scope.declare(item.name, { kind: "fn", node: item });
      if (!res.ok) ctx.errors.push(res.message);
    }
  }

  for (const item of program.items) {
    resolveTopLevel(item, ctx);
  }

  if (ctx.errors.length) {
    throw new Error(ctx.errors.join("\n"));
  }
  return program;
}

function resolveTopLevel(item, ctx) {
  if (item.type === "ExternUse") return;
  if (item.type === "StructDecl" || item.type === "EnumDecl") return;
  if (item.type === "FnDecl") {
    const fnScope = new Scope(ctx.scope);
    for (const name of item.params) {
      const res = fnScope.declare(name, { kind: "param", mutable: false });
      if (!res.ok) ctx.errors.push(res.message);
    }
    resolveExpr(item.body, { ...ctx, scope: fnScope });
    return;
  }
  resolveStmt(item, ctx);
}

function resolveStmt(stmt, ctx) {
  switch (stmt.type) {
    case "LetStmt": {
      resolveExpr(stmt.expr, ctx);
      const res = ctx.scope.declare(stmt.name, {
        kind: "let",
        mutable: stmt.mutable,
        init: stmt.expr,
      });
      if (!res.ok) ctx.errors.push(res.message);
      return;
    }
    case "AssignStmt": {
      resolveLValue(stmt.target, ctx, stmt.op);
      resolveExpr(stmt.right, ctx);
      return;
    }
    case "ExprStmt":
      resolveExpr(stmt.expr, ctx);
      return;
    case "WhileStmt":
      enforceBoolean(stmt.condition, ctx, "while");
      resolveExpr(stmt.condition, ctx);
      ctx.loopDepth += 1;
      resolveExpr(stmt.body, ctx);
      ctx.loopDepth -= 1;
      return;
    case "ForStmt": {
      resolveExpr(stmt.start, ctx);
      resolveExpr(stmt.end, ctx);
      const loopScope = new Scope(ctx.scope);
      const res = loopScope.declare(stmt.name, { kind: "let", mutable: true });
      if (!res.ok) ctx.errors.push(res.message);
      ctx.loopDepth += 1;
      resolveExpr(stmt.body, { ...ctx, scope: loopScope });
      ctx.loopDepth -= 1;
      return;
    }
    case "BreakStmt":
    case "ContinueStmt":
      if (ctx.loopDepth <= 0) {
        ctx.errors.push(`${stmt.type} is only valid inside loops`);
      }
      return;
    default:
      ctx.errors.push(`Unknown statement: ${stmt.type}`);
  }
}

function resolveExpr(expr, ctx) {
  switch (expr.type) {
    case "Identifier":
      if (!ctx.scope.lookup(expr.name)) {
        ctx.errors.push(`Undefined identifier: ${expr.name}`);
      }
      return;
    case "EnumValue": {
      const variants = ctx.enums.get(expr.enumName);
      if (!variants) {
        ctx.errors.push(`Unknown enum: ${expr.enumName}`);
        return;
      }
      if (!variants.includes(expr.variant)) {
        ctx.errors.push(
          `Unknown enum variant: ${expr.enumName}::${expr.variant}`,
        );
      }
      return;
    }
    case "StructLiteral":
      if (!ctx.structs.has(expr.name)) {
        ctx.errors.push(`Unknown struct: ${expr.name}`);
      }
      expr.values.forEach((v) => resolveExpr(v, ctx));
      return;
    case "ArrayLiteral":
      expr.elements.forEach((v) => resolveExpr(v, ctx));
      return;
    case "ArrayRepeat":
      resolveExpr(expr.value, ctx);
      resolveExpr(expr.count, ctx);
      return;
    case "MemberExpr":
      resolveExpr(expr.object, ctx);
      return;
    case "IndexExpr":
      resolveExpr(expr.object, ctx);
      resolveExpr(expr.index, ctx);
      return;
    case "CallExpr":
      resolveExpr(expr.callee, ctx);
      expr.args.forEach((a) => resolveExpr(a, ctx));
      return;
    case "DotCall":
      resolveExpr(expr.object, ctx);
      expr.args.forEach((a) => resolveExpr(a, ctx));
      return;
    case "BinaryExpr":
      resolveExpr(expr.left, ctx);
      resolveExpr(expr.right, ctx);
      return;
    case "UnaryExpr":
      resolveExpr(expr.expr, ctx);
      return;
    case "IfExpr":
      enforceBoolean(expr.condition, ctx, "if");
      resolveExpr(expr.condition, ctx);
      resolveExpr(expr.thenBranch, ctx);
      if (expr.elseBranch) resolveExpr(expr.elseBranch, ctx);
      return;
    case "MatchExpr":
      resolveExpr(expr.expr, ctx);
      resolveMatch(expr, ctx);
      return;
    case "BlockExpr": {
      const inner = new Scope(ctx.scope);
      for (const st of expr.statements) {
        resolveStmt(st, { ...ctx, scope: inner });
      }
      if (expr.tail) resolveExpr(expr.tail, { ...ctx, scope: inner });
      return;
    }
    case "FnExpr": {
      const inner = new Scope(ctx.scope);
      for (const name of expr.params) {
        const res = inner.declare(name, { kind: "param", mutable: false });
        if (!res.ok) ctx.errors.push(res.message);
      }
      resolveExpr(expr.body, { ...ctx, scope: inner });
      return;
    }
    case "NumberLiteral":
    case "StringLiteral":
    case "CharLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
      return;
    case "IsExpr": {
      resolveExpr(expr.left, ctx);
      const variants = ctx.enums.get(expr.variant.enumName);
      if (!variants || !variants.includes(expr.variant.variant)) {
        ctx.errors.push(
          `Unknown enum variant: ${expr.variant.enumName}::${expr.variant.variant}`,
        );
      }
      return;
    }
    default:
      ctx.errors.push(`Unknown expression: ${expr.type}`);
  }
}

function resolveMatch(matchExpr, ctx) {
  const cases = matchExpr.cases;
  if (!cases.length) {
    ctx.errors.push("Match must contain at least one case");
    return;
  }

  let enumName = null;
  const enumCases = new Set();
  let hasWildcard = false;

  for (const c of cases) {
    resolvePattern(c.pattern, ctx);
    resolveExpr(c.body, ctx);

    if (c.pattern.type === "WildcardPattern") {
      hasWildcard = true;
    }
    if (c.pattern.type === "EnumPattern") {
      if (!enumName) enumName = c.pattern.enumName;
      if (enumName !== c.pattern.enumName) {
        ctx.errors.push("Match cases must use a single enum type");
      }
      enumCases.add(c.pattern.variant);
    }
  }

  if (enumName) {
    const variants = ctx.enums.get(enumName) || [];
    const missing = variants.filter((v) => !enumCases.has(v));
    if (missing.length && !hasWildcard) {
      ctx.errors.push(
        `Non-exhaustive match on ${enumName}: missing ${missing.join(", ")}`,
      );
    }
    return;
  }

  if (!hasWildcard) {
    ctx.errors.push(
      "Match must include a wildcard case '_' when not matching a known enum",
    );
  }
}

function resolvePattern(pattern, ctx) {
  if (pattern.type === "EnumPattern") {
    const variants = ctx.enums.get(pattern.enumName);
    if (!variants) {
      ctx.errors.push(`Unknown enum: ${pattern.enumName}`);
      return;
    }
    if (!variants.includes(pattern.variant)) {
      ctx.errors.push(
        `Unknown enum variant: ${pattern.enumName}::${pattern.variant}`,
      );
    }
  }
}

function resolveLValue(target, ctx, op) {
  if (target.type === "Identifier") {
    const info = ctx.scope.lookup(target.name);
    if (!info) {
      ctx.errors.push(`Assignment to undefined: ${target.name}`);
      return;
    }
    if (info.kind === "let" || info.kind === "param") {
      if (!info.mutable) {
        ctx.errors.push(`Cannot assign to immutable binding: ${target.name}`);
      }
      return;
    }
    ctx.errors.push(`Invalid assignment target: ${target.name}`);
    return;
  }

  if (target.type === "MemberExpr") {
    const base = target.object;
    if (base.type !== "Identifier") {
      ctx.errors.push(
        "Field assignment only allowed on named variables in bootstrap",
      );
      return;
    }
    const info = ctx.scope.lookup(base.name);
    if (!info || !info.mutable) {
      ctx.errors.push(`Cannot assign field on immutable binding: ${base.name}`);
      return;
    }
    if (info.init && info.init.type === "StructLiteral") {
      const struct = ctx.structs.get(info.init.name);
      if (struct) {
        const field = struct.fields.find((f) => f.name === target.property);
        if (!field) {
          ctx.errors.push(
            `Unknown field ${target.property} on ${info.init.name}`,
          );
          return;
        }
        if (!field.mutable) {
          ctx.errors.push(
            `Field ${target.property} is immutable on ${info.init.name}`,
          );
        }
      }
    }
    return;
  }

  if (target.type === "IndexExpr") {
    resolveExpr(target.object, ctx);
    resolveExpr(target.index, ctx);
    return;
  }

  ctx.errors.push(`Invalid assignment target for operator ${op}`);
}

function enforceBoolean(expr, ctx, kind) {
  if (!isBooleanExpr(expr)) {
    ctx.errors.push(`Condition in ${kind} must be boolean`);
  }
}

function isBooleanExpr(expr) {
  if (!expr) return false;
  if (expr.type === "BooleanLiteral") return true;
  if (expr.type === "UnaryExpr" && expr.op === "!")
    return isBooleanExpr(expr.expr);
  if (expr.type === "BinaryExpr") {
    if (["==", "!=", "<", ">", "<=", ">="].includes(expr.op)) return true;
    if (["&&", "||"].includes(expr.op))
      return isBooleanExpr(expr.left) && isBooleanExpr(expr.right);
  }
  if (expr.type === "IsExpr") return true;
  return false;
}

module.exports = { resolveProgram };
