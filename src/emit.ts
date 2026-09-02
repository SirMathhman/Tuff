import type { Expr, Statement } from "./ast";

export function emitExpr(e: Expr): string {
  switch (e.kind) {
    case "ident":
      return e.name;
    case "lit":
      return e.value;
    case "addressOf":
      return emitExpr(e.target);
    case "deref":
      return emitExpr(e.target);
    case "binary":
      return `${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)}`;
    case "member":
      return `${emitExpr(e.object)}.${e.property}`;
    case "call":
      return `${emitExpr(e.callee)}(${e.args.map(emitExpr).join(", ")})`;
  }
}

export function emitStatement(
  s: Statement,
  refMap: Map<string, string>,
): string {
  switch (s.kind) {
    case "let":
      return `let ${s.name} = ${emitExpr(s.init)}`;
    case "letMut":
      return `let ${s.name} = ${emitExpr(s.init)}`;
    case "assign":
      return `${s.name} = ${emitExpr(s.value)}`;
    case "derefAssign": {
      const targetName =
        s.target.kind === "ident" ? s.target.name : emitExpr(s.target);
      const pointee = refMap.get(targetName) ?? targetName;
      return `${pointee} = ${emitExpr(s.value)}`;
    }
    case "block": {
      const inner = s.statements
        .map((st) => emitStatement(st, refMap))
        .join("; ");
      return `{ ${inner} }`;
    }
    case "expr":
      return emitExpr(s.value);
  }
}
