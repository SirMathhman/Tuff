import type { Ast } from "./types";

// Hybrid compiler — constant-folds programs that don't reference `args`, and
// generates real JS (with `args` as a free variable) for programs that do.
// The test harness executes the emitted JS with `args` bound to the runtime args.

// True if the AST reads the `args` input (an identifier named "args").
// The `in let args : &[&Str];` declaration alone does NOT count — only reads.
export function referencesArgs(node: Ast): boolean {
  if (node.kind === "ident") return node.name === "args";
  // Walk all Ast-typed child fields generically (single or array).
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) {
      if (v.some((x) => x && typeof x === "object" && "kind" in x && referencesArgs(x as Ast)))
        return true;
    } else if (v && typeof v === "object" && "kind" in v) {
      if (referencesArgs(v as Ast)) return true;
    }
  }
  return false;
}

// Compile a program that references `args` into JS statements ending in
// `process.exit(<expr>);`. `args` is a free variable at runtime.
export function compileAst(ast: Ast): string {
  if (ast.kind === "block") {
    const stmts = ast.statements.filter((s) => s !== null);
    if (stmts.length === 0) return "process.exit(0);";
    const body = stmts.slice(0, -1).map((s) => genStatement(s!));
    return body.join("\n") + "\nprocess.exit(" + genExpr(stmts[stmts.length - 1]!) + ");";
  }
  return "process.exit(" + genExpr(ast) + ");";
}

function genStatement(node: Ast): string {
  switch (node.kind) {
    case "inlet":
      // `args` is a free variable provided by the runtime — declaration only.
      return "";
    case "let":
      return "let " + node.name + " = " + genExpr(node.value) + ";";
    case "assign":
      return node.name + " = " + genExpr(node.value) + ";";
    case "augassign":
      return node.name + " " + node.op + "= " + genExpr(node.value) + ";";
    case "array_assign":
      return "(" + genExpr(node.target) + ")[" + genExpr(node.index) + "] = " + genExpr(node.value) + ";";
    case "fn": {
      const params = node.params.map((p) => p.name).join(", ");
      return "function " + node.name + "(" + params + ") { return " + genExpr(node.body) + "; }";
    }
    case "if_stmt": {
      const elseCode = node.elseBranch ? " else " + genStatement(node.elseBranch) : "";
      return "if (" + genExpr(node.cond) + ") " + genStatement(node.thenBranch) + elseCode;
    }
    case "while":
      return "while (" + genExpr(node.cond) + ") " + genStatement(node.body);
    case "for":
      return (
        "for (let " +
        node.varName +
        " = (" +
        genExpr(node.start) +
        "); " +
        node.varName +
        " < (" +
        genExpr(node.end) +
        "); " +
        node.varName +
        "++) " +
        genStatement(node.body)
      );
    case "return":
      return "return " + (node.value ? genExpr(node.value) : "0") + ";";
    case "yield":
      return "return " + genExpr(node.value) + ";";
    case "break":
      return "break;";
    case "continue":
      return "continue;";
    case "typealias":
    case "structdef":
    case "enumdef":
      // Type declarations are erased at runtime.
      return "";
    default:
      return genExpr(node) + ";";
  }
}

function genExpr(node: Ast): string {
  switch (node.kind) {
    case "num":
      return String(node.value);
    case "bool":
      return node.value ? "true" : "false";
    case "char":
      return JSON.stringify(node.value) + ".charCodeAt(0)";
    case "string":
      return JSON.stringify(node.value);
    case "null":
      return "0";
    case "ident":
      return node.name;
    case "binop": {
      const l = genExpr(node.left);
      const r = genExpr(node.right);
      if (node.op === "==") return "(Number((" + l + ") === (" + r + ")))";
      if (node.op === "!=") return "(Number((" + l + ") !== (" + r + ")))";
      if (node.op === "<" || node.op === "<=" || node.op === ">" || node.op === ">=")
        return "(Number((" + l + ") " + node.op + " (" + r + ")))";
      return "((" + l + ") " + node.op + " (" + r + "))";
    }
    case "unary": {
      const operand = genExpr(node.operand);
      if (node.op === "-" || node.op === "!") return "(" + node.op + "(" + operand + "))";
      // &, &mut, * — references alias their target in JS.
      return "(" + operand + ")";
    }
    case "index":
      return "((" + genExpr(node.target) + ")[" + genExpr(node.index) + "])";
    case "length":
      return "((" + genExpr(node.target) + ").length)";
    case "property_access":
      return "((" + genExpr(node.target) + ")." + node.property + ")";
    case "paren":
      return "(" + genExpr(node.expr) + ")";
    case "array":
      return "[" + node.elements.map(genExpr).join(", ") + "]";
    case "tuple":
      return "[" + node.elements.map(genExpr).join(", ") + "]";
    case "record":
      return "({" + node.fields.map((f) => f.key + ": " + genExpr(f.value)).join(", ") + "})";
    case "structliteral":
      return "({" + node.fields.map((f) => f.key + ": " + genExpr(f.value)).join(", ") + "})";
    case "call": {
      const target = node.target ? genExpr(node.target) : node.name;
      return "(" + target + ")(" + node.args.map(genExpr).join(", ") + ")";
    }
    case "if_expr":
      return "(" + genExpr(node.cond) + " ? " + genExpr(node.thenBranch) + " : " + genExpr(node.elseBranch) + ")";
    case "match": {
      const matchVal = genExpr(node.expr);
      let js = "0";
      for (let i = node.cases.length - 1; i >= 0; i--) {
        const c = node.cases[i]!;
        const cond = c.pattern.kind === "wildcard" ? "true" : "((" + genExpr(c.pattern) + ") === (" + matchVal + "))";
        js = "(" + cond + " ? " + genExpr(c.body) + " : " + js + ")";
      }
      return js;
    }
    case "block": {
      const stmts = node.statements.filter((s) => s !== null);
      if (stmts.length === 0) return "0";
      const body = stmts.slice(0, -1).map((s) => genStatement(s!));
      return "(function() { " + body.join(" ") + " return " + genExpr(stmts[stmts.length - 1]!) + "; })()";
    }
    default:
      throw new Error("cannot compile " + node.kind + " in args-dependent code");
  }
}
