"use strict";

function emitProgram(program) {
  const out = new Emitter();
  out.line('"use strict";');
  out.line("");
  emitPrelude(out);

  const externs = program.items.filter((i) => i.type === "ExternUse");
  for (const ext of externs) {
    out.line(
      `const { ${ext.names.join(", ")} } = require(\"./${ext.pkg}.js\");`,
    );
  }
  if (externs.length) out.line("");

  const decls = program.items.filter((i) =>
    ["StructDecl", "EnumDecl", "FnDecl"].includes(i.type),
  );
  for (const decl of decls) {
    emitDecl(decl, out);
    out.line("");
  }

  const statements = program.items.filter(
    (i) => !["StructDecl", "EnumDecl", "FnDecl", "ExternUse"].includes(i.type),
  );
  for (const stmt of statements) {
    emitStmt(stmt, out);
  }

  return out.toString();
}

function emitPrelude(out) {
  out.line("function __tuff_call(obj, name, ext, args) {");
  out.indent();
  out.line('if (obj && typeof obj[name] === "function") {');
  out.indent();
  out.line("return obj[name](...args);");
  out.dedent();
  out.line("}");
  out.line('if (typeof ext !== "function") {');
  out.indent();
  out.line("throw new Error(`Unknown method: ${name}`);");
  out.dedent();
  out.line("}");
  out.line("return ext(obj, ...args);");
  out.dedent();
  out.line("}");
  out.line("");

  out.line("function __tuff_is(value, enumName, variant) {");
  out.indent();
  out.line(
    "return !!value && value.__enum === enumName && value.__tag === variant;",
  );
  out.dedent();
  out.line("}");
  out.line("");
}

function emitDecl(decl, out) {
  if (decl.type === "StructDecl") {
    const params = decl.fields.map((_, i) => `_f${i}`);
    out.line(`function ${decl.name}(${params.join(", ")}) {`);
    out.indent();
    out.line("return {");
    out.indent();
    decl.fields.forEach((field, idx) => {
      const comma = idx < decl.fields.length - 1 ? "," : "";
      out.line(`${field.name}: ${params[idx]}${comma}`);
    });
    out.dedent();
    out.line("};");
    out.dedent();
    out.line("}");
    return;
  }

  if (decl.type === "EnumDecl") {
    out.line(`const ${decl.name} = Object.freeze({`);
    out.indent();
    decl.variants.forEach((variant, idx) => {
      const comma = idx < decl.variants.length - 1 ? "," : "";
      out.line(
        `${variant}: Object.freeze({ __enum: \"${decl.name}\", __tag: \"${variant}\" })${comma}`,
      );
    });
    out.dedent();
    out.line("});");
    return;
  }

  if (decl.type === "FnDecl") {
    out.line(`function ${decl.name}(${decl.params.join(", ")}) {`);
    out.indent();
    out.line(`return ${emitExpr(decl.body)};`);
    out.dedent();
    out.line("}");
  }
}

function emitStmt(stmt, out) {
  switch (stmt.type) {
    case "LetStmt": {
      const kw = stmt.mutable ? "let" : "const";
      out.line(`${kw} ${stmt.name} = ${emitExpr(stmt.expr)};`);
      return;
    }
    case "AssignStmt": {
      out.line(`${emitExpr(stmt.target)} ${stmt.op} ${emitExpr(stmt.right)};`);
      return;
    }
    case "ExprStmt":
      out.line(`${emitExpr(stmt.expr)};`);
      return;
    case "WhileStmt": {
      out.line(`while (${emitExpr(stmt.condition)}) {`);
      out.indent();
      emitExprAsStmt(stmt.body, out);
      out.dedent();
      out.line("}");
      return;
    }
    case "ForStmt": {
      const start = emitExpr(stmt.start);
      const end = emitExpr(stmt.end);
      out.line(
        `for (let ${stmt.name} = ${start}, __end = ${end}; ${stmt.name} < __end; ${stmt.name} += 1) {`,
      );
      out.indent();
      emitExprAsStmt(stmt.body, out);
      out.dedent();
      out.line("}");
      return;
    }
    case "BreakStmt":
      out.line("break;");
      return;
    case "ContinueStmt":
      out.line("continue;");
      return;
    default:
      out.line(`/* unsupported stmt ${stmt.type} */`);
  }
}

function emitExprAsStmt(expr, out) {
  if (expr.type === "BlockExpr") {
    emitBlock(expr, out, false);
    return;
  }
  out.line(`${emitExpr(expr)};`);
}

function emitExpr(expr) {
  switch (expr.type) {
    case "NumberLiteral":
      return expr.value;
    case "StringLiteral":
      return `\"${expr.value}\"`;
    case "CharLiteral":
      return `\"${expr.value}\"`;
    case "BooleanLiteral":
      return expr.value ? "true" : "false";
    case "NullLiteral":
      return "null";
    case "Identifier":
      return expr.name;
    case "EnumValue":
      return `${expr.enumName}.${expr.variant}`;
    case "StructLiteral":
      return `${expr.name}(${expr.values.map(emitExpr).join(", ")})`;
    case "ArrayLiteral":
      return `[${expr.elements.map(emitExpr).join(", ")}]`;
    case "ArrayRepeat": {
      const value = emitExpr(expr.value);
      const count = emitExpr(expr.count);
      return `(() => { const __v = ${value}; return Array(${count}).fill(__v); })()`;
    }
    case "MemberExpr":
      return `${emitExpr(expr.object)}.${expr.property}`;
    case "IndexExpr":
      return `${emitExpr(expr.object)}[${emitExpr(expr.index)}]`;
    case "CallExpr":
      return `${emitExpr(expr.callee)}(${expr.args.map(emitExpr).join(", ")})`;
    case "DotCall":
      return `__tuff_call(${emitExpr(expr.object)}, \"${expr.property}\", ${expr.property}, [${expr.args.map(emitExpr).join(", ")}])`;
    case "BinaryExpr":
      return `(${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)})`;
    case "UnaryExpr":
      return `(${expr.op}${emitExpr(expr.expr)})`;
    case "IfExpr": {
      const elseBranch = expr.elseBranch ? emitExpr(expr.elseBranch) : "null";
      return `(() => (${emitExpr(expr.condition)} ? ${emitExpr(expr.thenBranch)} : ${elseBranch}))()`;
    }
    case "MatchExpr":
      return emitMatchExpr(expr);
    case "BlockExpr":
      return emitBlockExpr(expr);
    case "FnExpr":
      return `function(${expr.params.join(", ")}) { return ${emitExpr(expr.body)}; }`;
    case "IsExpr":
      return `__tuff_is(${emitExpr(expr.left)}, \"${expr.variant.enumName}\", \"${expr.variant.variant}\")`;
    default:
      return "undefined";
  }
}

function emitBlockExpr(expr) {
  const out = new Emitter();
  out.line("(() => {");
  out.indent();
  for (const st of expr.statements) {
    emitStmt(st, out);
  }
  if (expr.tail) {
    out.line(`return ${emitExpr(expr.tail)};`);
  } else {
    out.line("return null;");
  }
  out.dedent();
  out.line("})()");
  return out.toString().trim();
}

function emitBlock(expr, out, wrap) {
  if (wrap) {
    out.line("{");
    out.indent();
  }
  for (const st of expr.statements) {
    emitStmt(st, out);
  }
  if (expr.tail) {
    out.line(`${emitExpr(expr.tail)};`);
  }
  if (wrap) {
    out.dedent();
    out.line("}");
  }
}

function emitMatchExpr(expr) {
  const out = new Emitter();
  out.line("(() => {");
  out.indent();
  out.line(`const __value = ${emitExpr(expr.expr)};`);

  const enumName = detectEnumMatch(expr);
  if (enumName) {
    out.line("switch (__value.__tag) {");
    out.indent();
    for (const c of expr.cases) {
      if (c.pattern.type === "EnumPattern") {
        out.line(`case \"${c.pattern.variant}\": return ${emitExpr(c.body)};`);
      } else if (c.pattern.type === "WildcardPattern") {
        out.line(`default: return ${emitExpr(c.body)};`);
      }
    }
    out.dedent();
    out.line("}");
    out.line('throw new Error("Non-exhaustive match");');
  } else {
    for (const c of expr.cases) {
      if (c.pattern.type === "WildcardPattern") {
        out.line(`return ${emitExpr(c.body)};`);
        continue;
      }
      const cond = emitPatternCheck(c.pattern, "__value");
      out.line(`if (${cond}) return ${emitExpr(c.body)};`);
    }
    out.line('throw new Error("Non-exhaustive match");');
  }

  out.dedent();
  out.line("})()");
  return out.toString().trim();
}

function detectEnumMatch(expr) {
  let enumName = null;
  for (const c of expr.cases) {
    if (c.pattern.type === "EnumPattern") {
      if (!enumName) enumName = c.pattern.enumName;
      if (enumName !== c.pattern.enumName) return null;
    }
  }
  return enumName;
}

function emitPatternCheck(pattern, valueExpr) {
  switch (pattern.type) {
    case "LiteralPattern":
      return `${valueExpr} === ${emitLiteral(pattern)}`;
    case "NullPattern":
      return `${valueExpr} === null`;
    case "EnumPattern":
      return `__tuff_is(${valueExpr}, \"${pattern.enumName}\", \"${pattern.variant}\")`;
    case "IdentifierPattern":
      return "true";
    default:
      return "false";
  }
}

function emitLiteral(pattern) {
  if (pattern.literalType === "number") return pattern.value;
  if (pattern.literalType === "string") return `\"${pattern.value}\"`;
  if (pattern.literalType === "char") return `\"${pattern.value}\"`;
  if (pattern.literalType === "bool") return pattern.value ? "true" : "false";
  return "null";
}

class Emitter {
  constructor() {
    this.lines = [];
    this.level = 0;
  }

  indent() {
    this.level += 1;
  }

  dedent() {
    this.level = Math.max(0, this.level - 1);
  }

  line(text) {
    const pad = "  ".repeat(this.level);
    this.lines.push(pad + text);
  }

  toString() {
    return this.lines.join("\n");
  }
}

module.exports = { emitProgram };
