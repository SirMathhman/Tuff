import type {
  Result,
  CompileError,
  Expression,
  VarEntry,
  StructDef,
  TypeAliasDef,
} from "./types";

const VALID_TYPES = ["U8", "U16", "U32", "I32", "F32", "Str", "USize"];

export { VALID_TYPES };

export function resolveAlias(
  typeName: string,
  aliases: TypeAliasDef[],
): string {
  const { base, args } = parseGenericTypeName(typeName);
  const aliasDef = aliases.find((a) => a.name === base);
  if (!aliasDef) return typeName;
  const resolved = resolveAlias(aliasDef.underlyingType, aliases);
  if (aliasDef.typeParams.length > 0 && args.length > 0) {
    let result = resolved;
    for (let i = 0; i < aliasDef.typeParams.length; i++) {
      const param = aliasDef.typeParams[i];
      const replacement = args[i] || param;
      result = result.replace(
        new RegExp("\\b" + param + "\\b", "g"),
        String(replacement),
      );
    }
    return result;
  }
  return resolved;
}

export function checkCircularAlias(
  aliasName: string,
  underlyingType: string,
  aliases: TypeAliasDef[],
  visited: string[],
): boolean {
  if (visited.includes(underlyingType)) return true;
  const aliasDef = aliases.find((a) => a.name === underlyingType);
  if (aliasDef) {
    if (aliasDef.name === aliasName) return true;
    return checkCircularAlias(
      aliasName,
      aliasDef.underlyingType,
      aliases,
      visited.concat([aliasDef.name]),
    );
  }
  return false;
}

export function parseGenericTypeName(typeName: string): {
  base: string;
  args: string[];
} {
  const idx = typeName.indexOf("<");
  if (idx < 0) return { base: typeName, args: [] };
  const base = typeName.substring(0, idx);
  const argsStr = typeName.substring(idx + 1, typeName.lastIndexOf(">"));
  const args = argsStr.split(",").map((s) => s.trim());
  return { base, args };
}

export function resolveFieldTypeWithGenerics(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
  aliases: TypeAliasDef[],
): string | undefined {
  if (expr.type === "Identifier") {
    const idExpr = expr as { name: string };
    const entry = scope.find((e) => e.name === idExpr.name);
    if (!entry || !entry.typeName) return undefined;
    const resolved = resolveAlias(entry.typeName, aliases);
    const { base, args } = parseGenericTypeName(resolved);
    const structDef = structs.find((s) => s.name === base);
    if (!structDef) return undefined;
    const f = structDef.fields.find((f) => f.name === field);
    if (!f) return undefined;
    const paramIdx = structDef.typeParams.indexOf(f.typeName);
    if (paramIdx >= 0 && args.length > paramIdx) return args[paramIdx];
    return f.typeName;
  }
  if (expr.type === "MemberExpression")
    return resolveMemberFieldType(expr, field, structs, scope, aliases);
  return undefined;
}

function resolveMemberFieldType(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
  aliases: TypeAliasDef[],
): string | undefined {
  const mexpr = expr as { object: Expression; field: string };
  const objType = resolveFieldTypeWithGenerics(
    mexpr.object,
    mexpr.field,
    structs,
    scope,
    aliases,
  );
  if (!objType) return undefined;
  const structDef = structs.find((s) => s.name === objType);
  if (!structDef) return undefined;
  const f = structDef.fields.find((f) => f.name === field);
  return f?.typeName;
}

export function checkTypeName(
  typeName: string,
  structs: StructDef[],
  loc: { line: number; column: number },
  label: string,
  aliases?: TypeAliasDef[],
): Result<void, CompileError> {
  const resolved = aliases ? resolveAlias(typeName, aliases) : typeName;
  const { base } = parseGenericTypeName(resolved);
  const isNumeric = VALID_TYPES.includes(base);
  const isStruct = structs.some((s) => s.name === base);
  const isAlias = aliases ? aliases.some((a) => a.name === typeName) : false;
  if (!isNumeric && !isStruct && !isAlias)
    return {
      isOk: false,
      error: {
        message: label + "'" + typeName + "'",
        reason:
          "Supported types: " + VALID_TYPES.join(", ") + " or a defined struct",
        suggestedFix:
          "Use a valid type like U8, U32, Bool, or define the struct first.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: undefined };
}

export function resolveFieldChainType(
  parts: string[],
  initialType: string | undefined,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): string | undefined {
  let currentType = initialType
    ? resolveAlias(initialType, aliases)
    : undefined;
  for (let i = 1; i < parts.length; i++) {
    if (!currentType) break;
    const structDef = structs.find((s) => s.name === currentType);
    if (!structDef) break;
    const fieldDef = structDef.fields.find((f) => f.name === parts[i]);
    if (!fieldDef) break;
    currentType = fieldDef.typeName;
  }
  return currentType;
}

export function checkRef(
  name: string,
  scope: VarEntry[],
  loc: { line: number; column: number },
): Result<{ typeName: string | undefined }, CompileError> {
  const entry = scope.find((e) => e.name === name);
  if (!entry)
    return {
      isOk: false,
      error: {
        message: "Use of undeclared variable '" + name + "'",
        reason: "Variable must be declared before use.",
        suggestedFix: "Declare the variable with 'let' first.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: { typeName: entry.typeName } };
}
