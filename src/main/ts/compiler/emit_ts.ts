import {
  AccessExpr,
  ArrayLiteralExpr,
  ArrayType,
  BinaryExpr,
  BlockExpr,
  CallExpr,
  Expression,
  ExpressionStmt,
  Field,
  FnDecl,
  IdentifierExpr,
  IfExpr,
  ImplDecl,
  ImportDecl,
  IndexExpr,
  IsExpr,
  LetDecl,
  LiteralExpr,
  Modifier,
  ModifierKind,
  NamedType,
  PrimitiveType,
  Program,
  SliceExpr,
  SliceType,
  Statement,
  StructDecl,
  StructLiteralExpr,
  TypeAliasDecl,
  TypeNode,
  UnaryExpr,
  UnionType,
  WhileExpr,
  YieldStmt,
} from "../ast/ast.js";

export function emitTypeScript(program: Program): string {
  resetGensym();
  const out: string[] = [];

  for (const stmt of program.statements) {
    out.push(emitStatement(stmt));
  }

  // Ensure trailing newline for tools.
  return out.filter(Boolean).join("\n") + "\n";
}

function emitStatement(stmt: Statement): string {
  switch (stmt.kind) {
    case "ImportDecl":
      return emitImportDecl(stmt as ImportDecl);
    case "LetDecl":
      return emitLetDecl(stmt as LetDecl);
    case "FnDecl":
      return emitFnDecl(stmt as FnDecl);
    case "StructDecl":
      return emitStructDecl(stmt as StructDecl);
    case "ImplDecl":
      return emitImplDecl(stmt as ImplDecl);
    case "TypeAliasDecl":
      return emitTypeAliasDecl(stmt as TypeAliasDecl);
    case "YieldStmt":
      // Yield only appears inside blocks; it should not appear top-level.
      return `return ${emitExpression((stmt as YieldStmt).expression)};`;
    case "ExpressionStmt":
      return emitExpressionStatement(stmt as ExpressionStmt);
    default:
      return "";
  }
}

function emitImportDecl(decl: ImportDecl): string {
  const modulePath = decl.namespace.join("/");
  const members = decl.members.join(", ");
  return `import { ${members} } from "./${modulePath}.js";`;
}

function emitLetDecl(decl: LetDecl): string {
  const isExported = hasModifier(decl.modifiers, "out");
  const isMutable = hasModifier(decl.modifiers, "mut");
  const kw = isMutable ? "let" : "const";
  const exp = isExported ? "export " : "";

  const type = decl.type ? `: ${emitType(decl.type)}` : "";
  return `${exp}${kw} ${escapeIdentifier(decl.name)}${type} = ${emitExpression(
    decl.initializer
  )};`;
}

function emitFnDecl(decl: FnDecl): string {
  const isExported = hasModifier(decl.modifiers, "out");
  const isExtern = hasModifier(decl.modifiers, "extern");
  const exp = isExported ? "export " : "";
  const decl_ = isExtern ? "declare " : "";

  return emitFunctionDecl({
    exportPrefix: `${exp}${decl_}`,
    ...prepareFunctionParts(decl),
  });
}

function emitStructDecl(decl: StructDecl): string {
  const isExported = hasModifier(decl.modifiers, "out");
  const exp = isExported ? "export " : "export "; // stage-0: export structural types by default
  const fields = decl.fields
    .map((f: Field) => `  ${emitPropertyName(f.name)}: ${emitType(f.type)};`)
    .join("\n");
  return `${exp}interface ${escapeIdentifier(decl.name)} {\n${fields}\n}`;
}

function emitImplDecl(decl: ImplDecl): string {
  const ns = escapeIdentifier(decl.target);
  const lines: string[] = [];
  lines.push(`export namespace ${ns} {`);

  for (const m of decl.methods) {
    const rendered = emitImplMethod(m);
    if (!rendered) continue;
    for (const l of rendered.split("\n")) {
      lines.push(`  ${l}`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

function emitImplMethod(decl: FnDecl): string {
  // Inside a namespace we always export the method.
  return emitFunctionDecl({
    exportPrefix: "export ",
    ...prepareFunctionParts(decl),
  });
}

function prepareFunctionParts(decl: FnDecl) {
  const params = decl.params
    .map((p) => `${escapeIdentifier(p.name)}: ${emitType(p.type)}`)
    .join(", ");
  const returnType = decl.returnType ? `: ${emitType(decl.returnType)}` : "";

  return {
    name: decl.name,
    params,
    returnType,
    body: decl.body,
  };
}

function emitTypeAliasDecl(decl: TypeAliasDecl): string {
  const isExported =
    hasModifier(decl.modifiers, "out") || decl.modifiers.length === 0;
  const exp = isExported ? "export " : "";
  if (!decl.type) {
    return `${exp}type ${decl.name} = unknown;`;
  }
  return `${exp}type ${decl.name} = ${emitType(decl.type)};`;
}

function emitExpressionStatement(stmt: ExpressionStmt): string {
  // If it is the last expression in the source, it may be used for exit-code;
  // but for TS emission we just emit it as a statement.
  return `${emitExpression(stmt.expression)};`;
}

function emitExpression(expr: Expression): string {
  switch (expr.kind) {
    case "LiteralExpr":
      return emitLiteralExpr(expr as LiteralExpr);
    case "IdentifierExpr":
      return escapeIdentifier((expr as IdentifierExpr).name);
    case "UnaryExpr":
      return emitUnaryExpr(expr as UnaryExpr);
    case "BinaryExpr":
      return emitBinaryExpr(expr as BinaryExpr);
    case "BlockExpr":
      return emitBlockExpr(expr as BlockExpr);
    case "IfExpr":
      return emitIfExpr(expr as IfExpr);
    case "WhileExpr":
      return emitWhileExpr(expr as WhileExpr);
    case "CallExpr":
      return emitCallExpr(expr as CallExpr);
    case "AccessExpr":
      return emitAccessExpr(expr as AccessExpr);
    case "IndexExpr":
      return emitIndexExpr(expr as IndexExpr);
    case "SliceExpr":
      return emitSliceExpr(expr as SliceExpr);
    case "StructLiteralExpr":
      return emitStructLiteralExpr(expr as StructLiteralExpr);
    case "ArrayLiteralExpr":
      return emitArrayLiteralExpr(expr as ArrayLiteralExpr);
    case "IsExpr":
      return emitIsExpr(expr as IsExpr);
    default:
      return "undefined";
  }
}

function emitIsExpr(expr: IsExpr): string {
  // Avoid double-evaluating the LHS by capturing it.
  const tmp = nextTemp("__is");
  const lhs = emitExpression(expr.expression);
  const guard = emitTypeGuard(tmp, expr.type);
  return `(() => { const ${tmp} = ${lhs}; return ${guard}; })()`;
}

function emitLiteralExpr(expr: LiteralExpr): string {
  if (typeof expr.value === "string") {
    return JSON.stringify(expr.value);
  }
  if (typeof expr.value === "number") return String(expr.value);
  if (typeof expr.value === "boolean") return expr.value ? "true" : "false";
  return "null";
}

function emitUnaryExpr(expr: UnaryExpr): string {
  return `${expr.operator.lexeme}${emitExpression(expr.right)}`;
}

function emitBinaryExpr(expr: BinaryExpr): string {
  return `${emitExpression(expr.left)} ${expr.operator.lexeme} ${emitExpression(
    expr.right
  )}`;
}

function emitBlockExpr(expr: BlockExpr): string {
  const lines: string[] = [];
  lines.push("(() => {");

  for (const s of expr.statements) {
    if (s.kind === "YieldStmt") {
      const y = s as YieldStmt;
      lines.push(`  return ${emitExpression(y.expression)};`);
      continue;
    }

    if (s.kind === "ExpressionStmt") {
      const st = s as ExpressionStmt;
      lines.push(`  ${emitExpression(st.expression)};`);
      continue;
    }

    // Other statements (let, fn, etc.)
    const rendered = emitStatement(s);
    if (rendered) {
      for (const l of rendered.split("\n")) {
        lines.push(`  ${l}`);
      }
    }
  }

  lines.push("})()");
  return lines.join("\n");
}

function emitIfExpr(expr: IfExpr): string {
  const thenExpr = emitExpression(expr.thenBranch);
  const elseExpr = expr.elseBranch
    ? emitExpression(expr.elseBranch)
    : "undefined";
  return `(${emitExpression(expr.condition)} ? ${thenExpr} : ${elseExpr})`;
}

function emitWhileExpr(expr: WhileExpr): string {
  const body = emitExpression(expr.body);
  // Body is already an IIFE; we want its inner statements.
  // Minimal lowering: emit an outer IIFE with a while loop and inline the body statements by emitting the block again.
  const bodyBlock = emitRawBlockStatements(expr.body);
  return `(() => {\n  while (${emitExpression(
    expr.condition
  )}) {\n${bodyBlock}\n  }\n})()`;
}

function emitRawBlockStatements(block: BlockExpr): string {
  const lines: string[] = [];
  for (const s of block.statements) {
    if (s.kind === "YieldStmt") {
      const y = s as YieldStmt;
      lines.push(`    return ${emitExpression(y.expression)};`);
      continue;
    }
    if (s.kind === "ExpressionStmt") {
      const st = s as ExpressionStmt;
      lines.push(`    ${emitExpression(st.expression)};`);
      continue;
    }
    const rendered = emitStatement(s);
    if (rendered) {
      for (const l of rendered.split("\n")) {
        lines.push(`    ${l}`);
      }
    }
  }
  return lines.join("\n");
}

function emitCallExpr(expr: CallExpr): string {
  const args = expr.args.map(emitExpression).join(", ");
  return `${emitExpression(expr.callee)}(${args})`;
}

function emitAccessExpr(expr: AccessExpr): string {
  return `${emitExpression(expr.object)}.${escapeIdentifier(expr.member)}`;
}

function emitIndexExpr(expr: IndexExpr): string {
  return `${emitExpression(expr.object)}[${emitExpression(expr.index)}]`;
}

function emitSliceExpr(expr: SliceExpr): string {
  return `${emitExpression(expr.object)}.slice(${emitExpression(
    expr.start
  )}, ${emitExpression(expr.end)})`;
}

function emitStructLiteralExpr(expr: StructLiteralExpr): string {
  const fields = expr.fields
    .map((f) => `${emitPropertyName(f.name)}: ${emitExpression(f.value)}`)
    .join(", ");
  // We lower structs to structural types; cast helps TS.
  return `({ ${fields} } as ${escapeIdentifier(expr.name)})`;
}

function emitArrayLiteralExpr(expr: ArrayLiteralExpr): string {
  const elements = expr.elements.map(emitExpression).join(", ");
  return `[${elements}]`;
}

function emitType(type: TypeNode): string {
  switch (type.kind) {
    case "PrimitiveType":
      return emitPrimitiveType(type as PrimitiveType);
    case "ArrayType":
      return `Array<${emitType((type as ArrayType).elementType)}>`;
    case "SliceType":
      return `Array<${emitType((type as SliceType).elementType)}>`;
    case "UnionType":
      return (type as UnionType).types.map(emitType).join(" | ");
    case "NamedType":
      return (type as NamedType).name;
    default:
      return "unknown";
  }
}

function emitTypeGuard(valueExpr: string, type: TypeNode): string {
  switch (type.kind) {
    case "PrimitiveType":
      return emitPrimitiveGuard(valueExpr, type as PrimitiveType);
    case "ArrayType":
      return `Array.isArray(${valueExpr})`;
    case "SliceType":
      return `Array.isArray(${valueExpr})`;
    case "UnionType":
      return (type as UnionType).types
        .map((t) => `(${emitTypeGuard(valueExpr, t)})`)
        .join(" || ");
    case "NamedType":
      // Stage-0: structs lower to plain objects. We can only do a coarse check.
      return `typeof ${valueExpr} === "object" && ${valueExpr} !== null`;
    default:
      return "false";
  }
}

function emitPrimitiveGuard(valueExpr: string, type: PrimitiveType): string {
  switch (type.name) {
    case "Bool":
      return `typeof ${valueExpr} === "boolean"`;
    case "NativeString":
      return `typeof ${valueExpr} === "string"`;
    case "Void":
      return `${valueExpr} === undefined`;
    default:
      // All numeric primitives map to number in stage 0.
      return `typeof ${valueExpr} === "number"`;
  }
}

function emitPrimitiveType(type: PrimitiveType): string {
  switch (type.name) {
    case "Bool":
      return "boolean";
    case "Void":
      return "void";
    case "NativeString":
      return "string";
    default:
      // All numeric primitives map to number in stage 0.
      return "number";
  }
}

function hasModifier(modifiers: Modifier[], kind: ModifierKind): boolean {
  return modifiers.some((m) => m.modifier === kind);
}

function emitFunctionDecl(args: {
  exportPrefix: string;
  name: string;
  params: string;
  returnType: string;
  body?: Expression;
}): string {
  const name = escapeIdentifier(args.name);

  if (!args.body) {
    return `${args.exportPrefix}function ${name}(${args.params})${args.returnType};`;
  }

  const bodyExpr = emitExpression(args.body);
  return `${args.exportPrefix}function ${name}(${args.params})${args.returnType} {\n  return ${bodyExpr};\n}`;
}

function emitPropertyName(name: string): string {
  return isSafeIdentifier(name) && !TS_RESERVED.has(name)
    ? name
    : JSON.stringify(name);
}

function escapeIdentifier(name: string): string {
  if (!isSafeIdentifier(name)) return name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (TS_RESERVED.has(name)) return `${name}_`;
  return name;
}

function isSafeIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

// Minimal reserved word list for Stage 0 TS emission.
const TS_RESERVED = new Set<string>([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

let _gensym = 0;

function resetGensym() {
  _gensym = 0;
}

function nextTemp(prefix: string): string {
  const name = `${prefix}${_gensym}`;
  _gensym += 1;
  return name;
}
