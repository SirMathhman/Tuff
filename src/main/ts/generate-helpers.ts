import type {
  Expression,
  LogicalExpressionExpr,
  NotExpressionExpr,
  ModuleExportsMap,
  NumberLiteralNode,
} from "./types";
import {
  parseTupleTypeString,
  isEnumType,
  getEnumDef,
} from "./semantic-generics";

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
  if (isEnumType(baseType)) {
    const def = getEnumDef(baseType);
    if (def)
      return (
        "([" +
        def.variants.map((v) => "'" + v + "'").join(", ") +
        "].includes(" +
        operand +
        "))"
      );
  }
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

function genLogicalExpr(
  le: LogicalExpressionExpr,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const op = le.operator === "AND" ? "&&" : "||";
  return (
    "(" +
    genExprScoped(le.left, declared, moduleExports) +
    " " +
    op +
    " " +
    genExprScoped(le.right, declared, moduleExports) +
    ")"
  );
}

function genBinaryExpr(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const binExpr = expr as {
    operator: string;
    left: Expression;
    right: Expression;
  };
  const left = genExprScoped(binExpr.left, declared, moduleExports);
  const right = genExprScoped(binExpr.right, declared, moduleExports);
  return "(" + left + " " + binExpr.operator + " " + right + ")";
}

function genNotOrIdentifier(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  if (expr.type === "NotExpression")
    return (
      "(!" +
      genExprScoped(
        (expr as NotExpressionExpr).operand,
        declared,
        moduleExports,
      ) +
      ")"
    );
  return resolveName((expr as { name: string }).name, declared);
}

function genMemberAccess(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const m = expr as { object: Expression; field: string };
  if (
    m.object.type === "Identifier" &&
    moduleExports &&
    moduleExports[(m.object as { name: string }).name]
  ) {
    const moduleName = (m.object as { name: string }).name;
    return 'require("' + moduleName + '").' + m.field;
  }
  const obj = genExprScoped(m.object, declared, moduleExports);
  if (/^\d+$/.test(m.field)) return obj + "[" + m.field + "]";
  return obj + "." + m.field;
}

function genTupleExprCode(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const t = expr as { elements: Expression[] };
  const elems = t.elements.map((e) =>
    genExprScoped(e, declared, moduleExports),
  );
  return "[" + elems.join(", ") + "]";
}

function genBoolLitCode(expr: Expression): string {
  return (expr as { value: boolean }).value ? "true" : "false";
}

function genIsExprCode(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const ie = expr as { operand: Expression; typeName: string };
  return genIsCheck(
    "(" + genExprScoped(ie.operand, declared, moduleExports) + ")",
    ie.typeName,
  );
}

function genStructInstanceCode(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const s = expr as {
    structName: string;
    fields: { name: string; value: Expression }[];
  };
  const fs = s.fields.map(
    (f) => f.name + ": " + genExprScoped(f.value, declared, moduleExports),
  );
  return "{ __type: '" + s.structName + "', " + fs.join(", ") + " }";
}

function genModuleAccess(expr: Expression): string {
  const ma = expr as { modulePath: string[]; field: string };
  const modulePath = ma.modulePath.join(".");
  return 'require("' + modulePath + '").' + ma.field;
}

function extractModuleParts(obj: Expression): string[] | null {
  const parts: string[] = [];
  let current: Expression | undefined = obj;
  while (current) {
    if (current.type === "Identifier") {
      parts.unshift((current as { name: string }).name);
      break;
    } else if (current.type === "MemberExpression") {
      const me = current as { object: Expression; field: string };
      parts.unshift(me.field);
      current = me.object;
    } else {
      return null;
    }
  }
  return parts;
}

function genRequireCall(
  modulePath: string,
  fieldPath: string,
  args: string[],
): string {
  return (
    'require("' + modulePath + '").' + fieldPath + "(" + args.join(", ") + ")"
  );
}

function tryResolveModuleCall(
  obj: Expression,
  functionName: string,
  moduleExports: ModuleExportsMap,
  args: string[],
): string | null {
  const parts = extractModuleParts(obj);
  if (!parts) return null;
  for (let i = 1; i < parts.length; i++) {
    const modulePath = parts.slice(0, i).join(".");
    const moduleKey = modulePath.replace(/\./g, "::");
    if (moduleExports[moduleKey]) {
      return genRequireCall(modulePath, parts.slice(i).join("."), args);
    }
  }
  const fullModulePath = parts.join(".");
  const fullModuleKey = fullModulePath.replace(/\./g, "::");
  if (moduleExports[fullModuleKey]) {
    return genRequireCall(fullModulePath, functionName, args);
  }
  return null;
}

function genFunctionCall(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const callExpr = expr as {
    functionName: string;
    object?: Expression;
    args: Expression[];
  };
  const args = callExpr.args.map((a) =>
    genExprScoped(a, declared, moduleExports),
  );
  if (callExpr.object) {
    if (moduleExports) {
      const resolved = tryResolveModuleCall(
        callExpr.object,
        callExpr.functionName,
        moduleExports,
        args,
      );
      if (resolved) return resolved;
    }
    const obj = genExprScoped(callExpr.object, declared, moduleExports);
    return obj + "." + callExpr.functionName + "(" + args.join(", ") + ")";
  }
  return callExpr.functionName + "(" + args.join(", ") + ")";
}

function genLiteralExpr(expr: Expression): string | null {
  if (expr.type === "NumberLiteral")
    return String((expr as NumberLiteralNode).value);
  if (expr.type === "BooleanLiteral") return genBoolLitCode(expr);
  if (expr.type === "StringLiteral")
    return JSON.stringify((expr as { value: string }).value);
  return null;
}

function genComplexExpr(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string | null {
  if (expr.type === "IsExpression")
    return genIsExprCode(expr, declared, moduleExports);
  if (expr.type === "StructInstance")
    return genStructInstanceCode(expr, declared, moduleExports);
  if (expr.type === "TupleExpr")
    return genTupleExprCode(expr, declared, moduleExports);
  if (expr.type === "MemberExpression")
    return genMemberAccess(expr, declared, moduleExports);
  if (expr.type === "ModuleAccess") return genModuleAccess(expr);
  return null;
}

function genOpExpr(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string | null {
  if (expr.type === "LogicalExpression")
    return genLogicalExpr(
      expr as LogicalExpressionExpr,
      declared,
      moduleExports,
    );
  if (expr.type === "BinaryExpression")
    return genBinaryExpr(expr, declared, moduleExports);
  if (expr.type === "FunctionCall")
    return genFunctionCall(expr, declared, moduleExports);
  return null;
}

function genExprScoped(
  expr: Expression,
  declared: string[],
  moduleExports?: ModuleExportsMap,
): string {
  const literal = genLiteralExpr(expr);
  if (literal !== null) return literal;
  const complex = genComplexExpr(expr, declared, moduleExports);
  if (complex !== null) return complex;
  const opResult = genOpExpr(expr, declared, moduleExports);
  if (opResult !== null) return opResult;
  return genNotOrIdentifier(expr, declared, moduleExports);
}

export {
  resolveName,
  genIsCheck,
  genTupleIsCheck,
  genLogicalExpr,
  genBinaryExpr,
  genNotOrIdentifier,
  genMemberAccess,
  genTupleExprCode,
  genBoolLitCode,
  genIsExprCode,
  genStructInstanceCode,
  genModuleAccess,
  tryResolveModuleCall,
  genFunctionCall,
  genExprScoped,
};
