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
import { parseTupleTypeString } from "./semantic-generics";

const NUMERIC_TYPES = [
  "U8",
  "U16",
  "U32",
  "U64",
  "USize",
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

function genTupleIsCheck(operand: string, tupleType: string): string {
  const parts = parseTupleTypeString(tupleType);
  if (!parts) return "false";
  const len = parts.length;
  let checks =
    "Array.isArray(" + operand + ") && " + operand + ".length === " + len;
  for (let i = 0; i < len; i++) {
    const elem = parts[i] as string;
    const sub = operand + "[" + i + "]";
    if (elem.startsWith("(")) {
      checks += " && " + genTupleIsCheck(sub, elem);
    } else {
      checks += " && " + genIsCheck(sub, elem);
    }
  }
  return "(" + checks + ")";
}

function genIsCheck(operand: string, typeName: string): string {
  if (typeName.startsWith("(") && typeName.endsWith(")"))
    return genTupleIsCheck(operand, typeName);
  const baseType = (typeName.split("<") as string[])[0] || "";
  if (baseType === "Bool") return "(typeof " + operand + " === 'boolean')";
  if (baseType === "Str") return "(typeof " + operand + " === 'string')";
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
    " === 'string' ? 0 : typeof " +
    name +
    " === 'object' ? 0 : " +
    name +
    ");"
  );
}

function genLogicalExpr(le: LogicalExpressionExpr, declared: string[]): string {
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

function genMemberAccess(expr: Expression, declared: string[]): string {
  const m = expr as { object: Expression; field: string };
  const obj = genExprScoped(m.object, declared);
  if (/^\d+$/.test(m.field)) return obj + "[" + m.field + "]";
  return obj + "." + m.field;
}

function genTupleExprCode(expr: Expression, declared: string[]): string {
  const t = expr as { elements: Expression[] };
  const elems = t.elements.map((e) => genExprScoped(e, declared));
  return "[" + elems.join(", ") + "]";
}

function genBoolLitCode(expr: Expression): string {
  return (expr as { value: boolean }).value ? "true" : "false";
}

function genIsExprCode(expr: Expression, declared: string[]): string {
  const ie = expr as IsExpressionExpr;
  return genIsCheck(
    "(" + genExprScoped(ie.operand, declared) + ")",
    ie.typeName,
  );
}

function genStructInstanceCode(expr: Expression, declared: string[]): string {
  const s = expr as {
    structName: string;
    fields: { name: string; value: Expression }[];
  };
  const fs = s.fields.map(
    (f) => f.name + ": " + genExprScoped(f.value, declared),
  );
  return "{ __type: '" + s.structName + "', " + fs.join(", ") + " }";
}

function genExprScoped(expr: Expression, declared: string[]): string {
  if (expr.type === "NumberLiteral")
    return String((expr as NumberLiteralNode).value);
  if (expr.type === "BooleanLiteral") return genBoolLitCode(expr);
  if (expr.type === "StringLiteral")
    return JSON.stringify((expr as { value: string }).value);
  if (expr.type === "IsExpression") return genIsExprCode(expr, declared);
  if (expr.type === "StructInstance")
    return genStructInstanceCode(expr, declared);
  if (expr.type === "TupleExpr") return genTupleExprCode(expr, declared);
  if (expr.type === "MemberExpression") return genMemberAccess(expr, declared);
  if (expr.type === "LogicalExpression")
    return genLogicalExpr(expr as LogicalExpressionExpr, declared);
  if (expr.type === "NotExpression")
    return (
      "(!" + genExprScoped((expr as NotExpressionExpr).operand, declared) + ")"
    );
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

function genExprExitStmt(
  s: Statement,
  lines: string[],
  declared: string[],
): boolean {
  if (s.type === "StringLiteral" || s.type === "MemberExpression") {
    lines.push(genExitCoerced(genExprScoped(s as Expression, declared)));
    return true;
  }
  if (s.type === "IsExpression") {
    const ie = s as IsExpressionExpr;
    lines.push("process.exit(" + genExprScoped(ie, declared) + " ? 1 : 0);");
    return true;
  }
  if (s.type === "Identifier") {
    const resolved = resolveName((s as IdentifierNode).name, declared);
    lines.push(genExitCoerced(resolved));
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

  if (genExprExitStmt(s, lines, declared)) return;

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
