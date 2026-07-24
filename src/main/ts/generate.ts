import type {
  Expression,
  Statement,
  NumberLiteralNode,
  IdentifierNode,
  LetDeclarationNode,
  AssignmentNode,
} from "./compile";

function resolveName(name: string, declared: string[]): string {
  for (let i = declared.length - 1; i >= 0; i--) {
    const d = declared[i];
    if (d && (d === name || d.startsWith(`${name}_`))) return d;
  }
  return name;
}

function genExprScoped(expr: Expression, declared: string[]): string {
  if (expr.type === "NumberLiteral") return String(expr.value);
  return resolveName(expr.name, declared);
}

export function generateCode(statements: Statement[]): string {
  const lines: string[] = [];
  const declared: string[] = [];
  for (const stmt of statements) {
    if (stmt.type === "NumberLiteral") {
      const node = stmt as NumberLiteralNode;
      lines.push(`process.exit(${node.value})`);
    } else if (stmt.type === "Identifier") {
      const node = stmt as IdentifierNode;
      lines.push(`process.exit(${node.name})`);
    } else if (stmt.type === "LetDeclaration") {
      const node = stmt as LetDeclarationNode;
      let unique = node.name;
      let i = 1;
      while (declared.includes(unique)) unique = `${node.name}_${i++}`;
      declared.push(unique);
      lines.push(`let ${unique} = ${genExprScoped(node.value, declared)}`);
    } else if (stmt.type === "Assignment") {
      const node = stmt as AssignmentNode;
      const resolved = resolveName(node.name, declared);
      lines.push(`${resolved} = ${genExprScoped(node.value, declared)}`);
    }
  }
  return lines.join("\n");
}
