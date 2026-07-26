import type {
  Result,
  CompileError,
  StructDefinitionNode,
  TypeAliasNode,
  StructDef,
  TypeAliasDef,
} from "./types";
import { errResult } from "./semantic-errors";
import {
  parseGenericTypeName,
  checkTypeName,
  checkCircularAlias,
  resolveAlias,
} from "./semantic-generics";
import { checkTypeRef } from "./semantic-errors";

export function checkStructDef(
  node: StructDefinitionNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  for (const field of node.fields) {
    if (!field.typeName)
      return errResult(
        "Struct field '" + field.name + "' missing type annotation",
        "All struct fields must have a type.",
        "Add ': <Type>' to field '" + field.name + "'.",
        node.line,
        node.column,
      );
    const isTypeParam = node.typeParams.includes(field.typeName);
    if (!isTypeParam) {
      const resolved = resolveAlias(field.typeName, aliases);
      const types = resolved.includes(" | ")
        ? resolved.split(" | ").map((a) => a.trim())
        : [resolved];
      for (const t of types) {
        const { base, args } = parseGenericTypeName(t);
        const baseCheck = checkTypeName(
          base,
          structs,
          node,
          "Invalid field type ",
        );
        if (!baseCheck.isOk) return baseCheck;
        for (const arg of args) {
          if (node.typeParams.includes(arg)) continue;
          const argCheck = checkTypeName(
            arg,
            structs,
            node,
            "Invalid field type argument '",
          );
          if (!argCheck.isOk) return argCheck;
        }
      }
    }
  }
  structs.push({
    name: node.name,
    typeParams: node.typeParams,
    fields: node.fields,
  });
  return { isOk: true, value: undefined };
}

function checkAliasUnderlying(
  underlyingType: string,
  typeParams: string[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  node: TypeAliasNode,
): Result<void, CompileError> {
  for (const arm of underlyingType.split(" | ")) {
    const resolved = resolveAlias(arm, aliases);
    const { base, args } = parseGenericTypeName(resolved);
    const baseCheck = checkTypeRef(
      base,
      structs,
      node,
      "Invalid underlying type '",
    );
    if (!baseCheck.isOk) return baseCheck;
    const structDef = baseCheck.value;
    if (
      structDef &&
      args.length > 0 &&
      args.length !== structDef.typeParams.length
    )
      return errResult(
        "Struct '" +
          base +
          "' expects " +
          structDef.typeParams.length +
          " type param(s) but got " +
          args.length,
        "Type argument count must match type parameter count.",
        "Provide " + structDef.typeParams.length + " type arguments.",
        node.line,
        node.column,
      );
    for (const arg of args) {
      if (typeParams.includes(arg)) continue;
      const argCheck = checkTypeName(
        arg,
        structs,
        node,
        "Invalid type argument '",
        aliases,
      );
      if (!argCheck.isOk) return argCheck;
    }
  }
  return { isOk: true, value: undefined };
}

export function checkTypeAlias(
  node: TypeAliasNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (checkCircularAlias(node.name, node.underlyingType, aliases, []))
    return errResult(
      "Circular type alias reference detected for '" + node.name + "'",
      "Type aliases cannot reference themselves directly or indirectly.",
      "Remove the circular reference.",
      node.line,
      node.column,
    );
  const underlyingCheck = checkAliasUnderlying(
    node.underlyingType,
    node.typeParams,
    structs,
    aliases,
    node,
  );
  if (!underlyingCheck.isOk) return underlyingCheck;
  return { isOk: true, value: undefined };
}
