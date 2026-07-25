import type {
  Expression,
  IsExpressionExpr,
  LogicalExpressionExpr,
  NotExpressionExpr,
  Statement,
  NumberLiteralNode,
  IdentifierNode,
  LetDeclarationNode,
  AssignmentNode,
  MemberAssignmentNode,
} from "./types";

const NUMERIC_TYPES = [
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
  "F32",
  "F64",
];

function resolveName(name: string, declared: string[]): string {
  for (let i = declared.length - 1; i >= 0; i--) {
    const d = declared[i];
    if (d && (d === name || d.startsWith(name + "_"))) return d;
  }
  return name;
}

function genIsCheck(operand: string, typeName: string): string {
  const baseType = (typeName.split("<") as string[])[0] || "";
  if (baseType === "Bool") return "(typeof " + operand + " === 'boolean')";
  if (NUMERIC_TYPES.includes(baseType))
    return "(typeof " + operand + " === 'number')";
  return (
    "(typeof " +
    operand +
    " === 'object' && " +
    operand +
    " !== null && " +
    operand +
    ".__type === '" +
    baseType +
    "')"
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
    " === 'object' ? 0 : " +
    name +
    ");"
  );
}

function genExprScoped(expr: Expression, declared: string[]): string {
  if (expr.type === "NumberLiteral")
    return String((expr as NumberLiteralNode).value);
  if (expr.type === "BooleanLiteral") {
    const b = (expr as { value: boolean }).value;
    return b ? "true" : "false";
  }
  if (expr.type === "IsExpression") {
    const ie = expr as IsExpressionExpr;
    const op = "(" + genExprScoped(ie.operand, declared) + ")";
    return genIsCheck(op, ie.typeName);
  }
  if (expr.type === "StructInstance") {
    const s = expr as {
      structName: string;
      fields: { name: string; value: Expression }[];
    };
    const fs = s.fields.map(
      (f) => f.name + ": " + genExprScoped(f.value, declared),
    );
    return "{ __type: '" + s.structName + "', " + fs.join(", ") + " }";
  }
  if (expr.type === "MemberExpression") {
    const m = expr as { object: Expression; field: string };
    return genExprScoped(m.object, declared) + "." + m.field;
  }
  if (expr.type === "LogicalExpression") {
    const le = expr as LogicalExpressionExpr;
    const op = le.operator === "AND" ? "&&" : "||";
    return (
      "(" +
      genExprScoped(le.left, declared) +
      " " +
      op +
      " " +
      genExprScoped(le.right, declared) +
      ")"
    );
  }
  if (expr.type === "NotExpression") {
    const ne = expr as NotExpressionExpr;
    return "(!" + genExprScoped(ne.operand, declared) + ")";
  }
  return resolveName(expr.name, declared);
}

function uniqueName(name: string, declared: string[]): string {
  let u = name;
  let i = 1;
  while (declared.includes(u)) u = name + "_" + i++;
  declared.push(u);
  return u;
}

export function generateCode(statements: Statement[]): string {
  const lines: string[] = [];
  const declared: string[] = [];
  for (const s of statements) genStmt(s, lines, declared);
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

function genStmt(s: Statement, lines: string[], declared: string[]): void {
  if (s.type === "StructDefinition" || s.type === "TypeAlias") return;
  const node = s as Statement;

  if (s.type === "NumberLiteral") {
    lines.push("process.exit(" + (node as NumberLiteralNode).value + ");");
    return;
  }

  if (genBoolExitStmt(s, node, lines, declared)) return;

  if (s.type === "IsExpression") {
    const ie = node as IsExpressionExpr;
    lines.push("process.exit(" + genExprScoped(ie, declared) + " ? 1 : 0);");
    return;
  }

  if (s.type === "Identifier") {
    const resolved = resolveName((node as IdentifierNode).name, declared);
    lines.push(genExitCoerced(resolved));
    return;
  }

  if (
    s.type === "LetDeclaration" ||
    s.type === "Assignment" ||
    s.type === "MemberAssignment"
  ) {
    const a = s as LetDeclarationNode | AssignmentNode | MemberAssignmentNode;
    genAssignment(s, a, lines, declared);
  }
}

function genAssignment(
  s: Statement,
  node: LetDeclarationNode | AssignmentNode | MemberAssignmentNode,
  lines: string[],
  declared: string[],
): void {
  if (s.type === "LetDeclaration") {
    const ln = node as LetDeclarationNode;
    lines.push(
      "let " +
        uniqueName(ln.name, declared) +
        " = " +
        genExprScoped(ln.value, declared) +
        ";",
    );
  } else if (s.type === "Assignment") {
    const an = node as AssignmentNode;
    lines.push(
      resolveName(an.name, declared) +
        " = " +
        genExprScoped(an.value, declared) +
        ";",
    );
  } else if (s.type === "MemberAssignment") {
    const mn = node as MemberAssignmentNode;
    lines.push(
      genExprScoped(mn.object, declared) +
        "." +
        mn.field +
        " = " +
        genExprScoped(mn.value, declared) +
        ";",
    );
  }
}
