import type {
  Expression,
  Statement,
  NumberLiteralNode,
  IdentifierNode,
  LetDeclarationNode,
  AssignmentNode,
  MemberAssignmentNode,
  LogicalExpressionExpr,
  NotExpressionExpr,
  IsExpressionExpr,
  ModuleExportsMap,
} from "./types";
import { resolveName, genExprScoped } from "./generate-helpers";

function isAssignmentLike(s: Statement): boolean {
  return (
    s.type === "LetDeclaration" ||
    s.type === "Assignment" ||
    s.type === "MemberAssignment"
  );
}

function genExitCoerced(name: string): string {
  return (
    "process.exit(typeof " +
    name +
    " === 'boolean' ? +" +
    name +
    " : typeof " +
    name +
    " === 'string' ? 0 : typeof " +
    name +
    " === 'object' ? 0 : " +
    name +
    ");"
  );
}

function uniqueName(name: string, declared: string[]): string {
  let u = name;
  let i = 1;
  while (declared.includes(u)) u = name + "_" + i++;
  declared.push(u);
  return u;
}

export function generateCode(
  statements: Statement[],
  moduleMode = false,
  moduleExports?: ModuleExportsMap,
): string {
  const lines: string[] = [];
  const declared: string[] = [];
  for (const s of statements)
    genStmt(s, lines, declared, moduleMode, moduleExports);
  return lines.join("\n");
}

function genBoolExitStmt(
  s: Statement,
  node: Statement,
  lines: string[],
  declared: string[],
): boolean {
  if (s.type === "LogicalExpression" || s.type === "NotExpression") {
    const le = node as LogicalExpressionExpr | NotExpressionExpr;
    lines.push("process.exit(" + genExprScoped(le, declared) + " ? 1 : 0);");
    return true;
  }
  return false;
}

function genExprExitStmt(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleExports?: ModuleExportsMap,
): boolean {
  if (
    s.type === "StringLiteral" ||
    s.type === "MemberExpression" ||
    s.type === "ModuleAccess" ||
    s.type === "BinaryExpression" ||
    s.type === "FunctionCall"
  ) {
    lines.push(
      genExitCoerced(genExprScoped(s as Expression, declared, moduleExports)),
    );
    return true;
  }
  if (s.type === "IsExpression") {
    const ie = s as IsExpressionExpr;
    lines.push(
      "process.exit(" +
        genExprScoped(ie, declared, moduleExports) +
        " ? 1 : 0);",
    );
    return true;
  }
  if (s.type === "Identifier") {
    const resolved = resolveName((s as IdentifierNode).name, declared);
    lines.push(genExitCoerced(resolved));
    return true;
  }
  return false;
}

function genExitStmt(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleExports?: ModuleExportsMap,
): boolean {
  const node = s as Statement;
  if (s.type === "NumberLiteral") {
    lines.push("process.exit(" + (node as NumberLiteralNode).value + ");");
    return true;
  }
  return (
    genBoolExitStmt(s, node, lines, declared) ||
    genExprExitStmt(s, lines, declared, moduleExports)
  );
}

function genExport(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleMode: boolean,
): void {
  if (!moduleMode) return;
  const exported = (s as { exported?: boolean }).exported;
  if (!exported) return;
  if (s.type === "LetDeclaration") {
    const ln = s as LetDeclarationNode;
    const resolved = resolveName(ln.name, declared);
    lines.push("exports." + ln.name + " = " + resolved + ";");
  } else if (s.type === "EnumDefinition") {
    const en = s as { name: string };
    lines.push("exports." + en.name + " = " + en.name + ";");
  } else if (s.type === "StructDefinition") {
    const st = s as { name: string };
    lines.push("exports." + st.name + " = {};");
  } else if (s.type === "TypeAlias") {
    const ta = s as { name: string };
    lines.push("exports." + ta.name + " = {};");
  } else if (s.type === "FunctionDefinition") {
    const fn = s as { name: string };
    lines.push("exports." + fn.name + " = " + fn.name + ";");
  }
}

function genStmt(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleMode = false,
  moduleExports?: ModuleExportsMap,
): void {
  if (genDefinitionStmt(s, lines, declared, moduleMode, moduleExports)) return;
  if (genExprExitStmts(s, lines, declared, moduleMode, moduleExports)) return;
  if (!moduleMode && genExitStmt(s, lines, declared, moduleExports)) return;
  if (isAssignmentLike(s)) {
    const a = s as LetDeclarationNode | AssignmentNode | MemberAssignmentNode;
    genAssignment(s, a, lines, declared, moduleExports);
    genExport(s, lines, declared, moduleMode);
  }
}

function genDefinitionStmt(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleMode: boolean,
  moduleExports?: ModuleExportsMap,
): boolean {
  if (s.type === "StructDefinition" || s.type === "TypeAlias") {
    genExport(s, lines, declared, moduleMode);
    return true;
  }
  if (s.type === "EnumDefinition") {
    const en = s as { name: string; variants: string[] };
    lines.push(
      "const " +
        en.name +
        " = { " +
        en.variants.map((v) => v + ": '" + v + "'").join(", ") +
        " };",
    );
    genExport(s, lines, declared, moduleMode);
    return true;
  }
  if (s.type === "FunctionDefinition") {
    genFunctionDefinition(s, lines, declared, moduleMode, moduleExports);
    return true;
  }
  return false;
}

function genExprExitStmts(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleMode: boolean,
  moduleExports?: ModuleExportsMap,
): boolean {
  if (
    s.type === "MemberExpression" ||
    s.type === "ModuleAccess" ||
    s.type === "FunctionCall"
  ) {
    genExprExitStmt(s, lines, declared, moduleExports);
    return true;
  }
  return false;
}

function genFunctionDefinition(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleMode: boolean,
  moduleExports?: ModuleExportsMap,
): void {
  const fn = s as {
    name: string;
    params: { name: string; typeName: string }[];
    body: Statement[];
    exported?: boolean;
  };
  const params = fn.params.map((p) => p.name).join(", ");
  lines.push("function " + fn.name + "(" + params + ") {");
  const fnDeclared = [...declared, ...fn.params.map((p) => p.name)];
  const bodyLines: string[] = [];
  for (let i = 0; i < fn.body.length; i++) {
    const stmt = fn.body[i];
    if (stmt === undefined) continue;
    const isLast = i === fn.body.length - 1;
    if (isLast) {
      genReturnStmt(stmt, bodyLines, fnDeclared, moduleExports);
    } else {
      genStmt(stmt, bodyLines, fnDeclared, moduleMode, moduleExports);
    }
  }
  for (const line of bodyLines) {
    lines.push(line);
  }
  lines.push("}");
  genExport(s, lines, declared, moduleMode);
}

function genReturnStmt(
  s: Statement,
  lines: string[],
  declared: string[],
  moduleExports?: ModuleExportsMap,
): void {
  if (s.type === "NumberLiteral") {
    lines.push("return " + (s as { value: number }).value + ";");
  } else if (s.type === "Identifier") {
    lines.push(
      "return " + resolveName((s as { name: string }).name, declared) + ";",
    );
  } else {
    lines.push(
      "return " + genExprScoped(s as Expression, declared, moduleExports) + ";",
    );
  }
}

function genAssignment(
  s: Statement,
  node: LetDeclarationNode | AssignmentNode | MemberAssignmentNode,
  lines: string[],
  declared: string[],
  moduleExports?: ModuleExportsMap,
): void {
  if (s.type === "LetDeclaration") {
    const ln = node as LetDeclarationNode;
    lines.push(
      "let " +
        uniqueName(ln.name, declared) +
        " = " +
        genExprScoped(ln.value, declared, moduleExports) +
        ";",
    );
  } else if (s.type === "Assignment") {
    const an = node as AssignmentNode;
    lines.push(
      resolveName(an.name, declared) +
        " = " +
        genExprScoped(an.value, declared, moduleExports) +
        ";",
    );
  } else if (s.type === "MemberAssignment") {
    const mn = node as MemberAssignmentNode;
    lines.push(
      genExprScoped(mn.object, declared, moduleExports) +
        "." +
        mn.field +
        " = " +
        genExprScoped(mn.value, declared, moduleExports) +
        ";",
    );
  }
}
