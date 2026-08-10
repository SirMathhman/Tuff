import type { AstNode, Expr } from "./types";

export function generateJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) =>
    genNode(n, (e) => `process.exit(Number(${e}));`),
  );
  return lines.filter((l) => l).join("\n");
}

function generateBlockJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) => genNode(n, (e) => `${e};`));
  return lines.join("");
}

function genNode(node: AstNode, wrapExpr: (expr: string) => string): string {
  if (node.type === "decl") return "";
  if (node.type === "let") return `let ${node.name}=${genExpr(node.init)};`;
  if (node.type === "assign") return `${genExpr(node.target)}=${genExpr(node.value)};`;
  if (node.type === "expr") return wrapExpr(genExpr(node.expr));
  if (node.type === "while") {
    const bodyJs = node.body.map((n) => genNode(n, (e) => `${e};`)).join("");
    return `while (${genExpr(node.condition)}) {${bodyJs}}`;
  }
  if (node.type === "for") {
    const bodyJs = node.body.map((n) => genNode(n, (e) => `${e};`)).join("");
    const startJs = genRangeStart(node.rangeExpr);
    const endJs = genRangeEnd(node.rangeExpr);
    return `for (let ${node.varName}=${startJs}; ${node.varName}<${endJs}; ${node.varName}++) {${bodyJs}}`;
  }
  if (node.type === "break") return "break;";
  if (node.type === "continue") return "continue;";
  throw new Error("Unknown node type");
}

const comparisonOps = new Set(["==", "<"]);

export function genExpr(expr: Expr): string {
  if (expr.type === "number") return String(expr.value);
  if (expr.type === "boolean") return expr.value ? "true" : "false";
  if (expr.type === "identifier") return expr.name;
  if (expr.type === "assign") return `${genExpr(expr.target)}=${genExpr(expr.value)}`;
  if (expr.type === "binary") {
    if (comparisonOps.has(expr.op)) {
      return genComparisonOp(genExpr(expr.left), expr.op, genExpr(expr.right));
    }
    if (expr.op === "..") {
      return `{start:${genExpr(expr.left)},end:${genExpr(expr.right)}}`;
    }
    return `${genExpr(expr.left)} ${expr.op} ${genExpr(expr.right)}`;
  }
  if (expr.type === "group") {
    const hasLet = expr.nodes.some((n) => n.type === "let");
    if (hasLet) {
      const lines = generateBlockJS(expr.nodes);
      const last = expr.nodes[expr.nodes.length - 1]!;
      if (last.type === "expr") {
        return `(function(){${lines}return ${genExpr(last.expr)};})()`;
      }
      throw new Error("Block with declarations must end with an expression");
    }
    const parts = expr.nodes.map((n) => genNode(n, (e) => e).replace(/;$/, ""));
    if (parts.length === 0) return "(0)";
    return `(${parts.join(",")})`;
  }
  if (expr.type === "if") {
    const thenJs = genNode(expr.thenNode, (e) => e).replace(/;$/, "");
    const elseJs = expr.elseNode
      ? genNode(expr.elseNode, (e) => e).replace(/;$/, "")
      : "0";
    return `(${genExpr(expr.condition)}) ? ${thenJs} : ${elseJs}`;
  }
  if (expr.type === "match") {
    const targetJs = genExpr(expr.target);
    const casesJs = expr.cases
      .map((c) => {
        if (c.pattern.type === "identifier" && c.pattern.name === "_") {
          return `default:{return ${genExpr(c.body)};}`;
        }
        return `case ${genExpr(c.pattern)}:{return ${genExpr(c.body)};}`;
      })
      .join("");
    return `(function(t){switch(t){${casesJs}}})(${targetJs})`;
  }
  if (expr.type === "array") {
    const elementsJs = expr.elements.map((e) => genExpr(e)).join(",");
    return `[${elementsJs}]`;
  }
  if (expr.type === "index") {
    return `${genExpr(expr.target)}[${genExpr(expr.index)}]`;
  }
  if (expr.type === "unary") {
    return `(-${genExpr(expr.operand)})`;
  }
  throw new Error("Unknown expression type");
}

function genComparisonOp(left: string, op: string, right: string): string {
  const jsOp = op === "==" ? "===" : op;
  return `(${left} ${jsOp} ${right})`;
}

export function genRangeStart(expr: Expr): string {
  if (expr.type === "range") return genExpr(expr.start);
  if (expr.type === "identifier") return `${expr.name}.start`;
  throw new Error("Invalid range expression");
}

export function genRangeEnd(expr: Expr): string {
  if (expr.type === "range") return genExpr(expr.end);
  if (expr.type === "identifier") return `${expr.name}.end`;
  throw new Error("Invalid range expression");
}
