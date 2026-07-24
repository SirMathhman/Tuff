import type {
  Expression,
  Statement,
  NumberLiteralNode,
  IdentifierNode,
  LetDeclarationNode,
  AssignmentNode,
  StructDefinitionNode,
  MemberAssignmentNode,
} from "./types";

function resolveName(name: string, declared: string[]): string {
  for (let i = declared.length - 1; i >= 0; i--) {
    const d = declared[i];
    if (d && (d === name || d.startsWith(`${name}_`))) return d;
  }
  return name;
}

function genExprScoped(expr: Expression, declared: string[]): string {
  if (expr.type === "NumberLiteral") {
    const numExpr = expr as NumberLiteralNode;
    return String(numExpr.value);
  }
  if (expr.type === "StructInstance") {
    const sexpr = expr as {
      structName: string;
      fields: { name: string; value: Expression }[];
    };
    const fieldStrs = sexpr.fields.map(
      (f) => `${f.name}: ${genExprScoped(f.value, declared)}`,
    );
    return `{ ${fieldStrs.join(", ")} }`;
  }
  if (expr.type === "MemberExpression") {
    const mexpr = expr as { object: Expression; field: string };
    return `${genExprScoped(mexpr.object, declared)}.${mexpr.field}`;
  }
  return resolveName(expr.name, declared);
}

export function generateCode(statements: Statement[]): string {
  const lines: string[] = [];
  const declared: string[] = [];
  const structNames: string[] = [];
  for (const stmt of statements) {
    if (stmt.type === "StructDefinition") {
      const node = stmt as StructDefinitionNode;
      structNames.push(node.name);
      // Skip interface generation - not needed at runtime
    } else if (stmt.type === "NumberLiteral") {
      const node = stmt as NumberLiteralNode;
      lines.push(`process.exit(${node.value});`);
    } else if (stmt.type === "Identifier") {
      const node = stmt as IdentifierNode;
      lines.push(`process.exit(${node.name});`);
    } else if (stmt.type === "LetDeclaration") {
      const node = stmt as LetDeclarationNode;
      let unique = node.name;
      let i = 1;
      while (declared.includes(unique)) unique = `${node.name}_${i++}`;
      declared.push(unique);
      // Strip all type annotations - transpiler doesn't support custom types
      lines.push(`let ${unique} = ${genExprScoped(node.value, declared)};`);
    } else if (stmt.type === "Assignment") {
      const node = stmt as AssignmentNode;
      const resolved = resolveName(node.name, declared);
      lines.push(`${resolved} = ${genExprScoped(node.value, declared)};`);
    } else if (stmt.type === "MemberAssignment") {
      const node = stmt as MemberAssignmentNode;
      const objStr = genExprScoped(node.object, declared);
      lines.push(
        `${objStr}.${node.field} = ${genExprScoped(node.value, declared)};`,
      );
    }
  }
  return lines.join("\n");
}
