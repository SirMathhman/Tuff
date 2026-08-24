import { err } from "../errors.ts";
import { ErrorKind } from "../errors.ts";
import type { EvalError } from "../errors.ts";
import type { Expr, FieldExpr, StructDeclStmt, StructExpr } from "../ast/index.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import { ValueKind } from "../eval/value.ts";
import type { Binding, StructValue, Value } from "../eval/value.ts";

type InferValueFn = (expr: Expr, env: Map<string, Binding>) => Result<Value, EvalError>;
type IntTypeInfer = (expr: Expr, env: Map<string, Binding>) => string | null;

export function checkStructDecl(
  stmt: StructDeclStmt,
  env: Map<string, Binding>,
  shadowed: Map<string, Binding | null>,
): Result<null, EvalError> {
  if (!shadowed.has(stmt.name)) {
    shadowed.set(stmt.name, env.get(stmt.name) ?? null);
  }
  env.set(stmt.name, {
    value: { kind: ValueKind.Struct, structName: stmt.name, fields: stmt.fields, values: [] },
    mutable: false,
  });
  return Ok(null);
}

export function validateField(
  expr: FieldExpr,
  env: Map<string, Binding>,
  inferValue: InferValueFn,
): Result<null, EvalError> {
  const obj = inferValue(expr.object, env);
  if (!obj.ok) return obj;
  if (obj.value.kind !== ValueKind.Struct) {
    return Err(
      err(ErrorKind.Semantic, "Cannot access a field of a non-struct value", expr.position),
    );
  }
  return Ok(null);
}

export function inferFieldType(
  expr: FieldExpr,
  env: Map<string, Binding>,
  inferValue: InferValueFn,
): string | null {
  const obj = inferValue(expr.object, env);
  if (!obj.ok || obj.value.kind !== ValueKind.Struct) return null;
  const field = (obj.value as StructValue).fields.find((f) => f.name === expr.field);
  return field ? field.type : null;
}

export function inferStructValue(
  expr: StructExpr,
  env: Map<string, Binding>,
  inferValue: InferValueFn,
  inferIntType: IntTypeInfer,
): Result<Value, EvalError> {
  const decl = env.get(expr.structName);
  if (!decl || decl.value.kind !== ValueKind.Struct) {
    return Err(err(ErrorKind.Semantic, `Undefined struct "${expr.structName}"`, expr.position));
  }
  const declFields = (decl.value as StructValue).fields;
  if (declFields.length !== expr.fields.length) {
    return Err(
      err(
        ErrorKind.Semantic,
        `Struct "${expr.structName}" has ${declFields.length} fields but ${expr.fields.length} were provided`,
        expr.position,
      ),
    );
  }
  const values: Value[] = [];
  for (let i = 0; i < expr.fields.length; i++) {
    const init = expr.fields[i];
    if (init === undefined) continue;
    const field = declFields.find((f) => f.name === init.name);
    if (!field) {
      return Err(
        err(
          ErrorKind.Semantic,
          `Struct "${expr.structName}" has no field "${init.name}"`,
          init.value.position,
        ),
      );
    }
    const v = inferValue(init.value, env);
    if (!v.ok) return v;
    const fieldType = inferIntType(init.value, env);
    if (fieldType !== null && fieldType !== field.type) {
      return Err(
        err(
          ErrorKind.Semantic,
          `Field "${field.name}" of "${expr.structName}" expects "${field.type}" but got "${fieldType}"`,
          init.value.position,
        ),
      );
    }
    values.push(v.value);
  }
  return Ok({ kind: ValueKind.Struct, structName: expr.structName, fields: declFields, values });
}

export function inferFieldValue(
  expr: FieldExpr,
  env: Map<string, Binding>,
  inferValue: InferValueFn,
): Result<Value, EvalError> {
  const obj = inferValue(expr.object, env);
  if (!obj.ok) return obj;
  if (obj.value.kind !== ValueKind.Struct) {
    return Err(
      err(ErrorKind.Semantic, "Cannot access a field of a non-struct value", expr.position),
    );
  }
  const structValue = obj.value as StructValue;
  const idx = structValue.fields.findIndex((f) => f.name === expr.field);
  if (idx === -1) {
    return Err(
      err(
        ErrorKind.Semantic,
        `Struct "${structValue.structName}" has no field "${expr.field}"`,
        expr.position,
      ),
    );
  }
  const value = structValue.values[idx];
  return Ok(value ?? { kind: ValueKind.Number, value: 0 });
}
