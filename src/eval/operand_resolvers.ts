/**
 * Functions for resolving operands during expression evaluation
 */
import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isStructDef,
  isPointer,
  hasKindBits,
  hasIdent,
  hasAddrOf,
  hasDeref,
  hasStructInstantiation,
  hasValue,
  hasAnnotation,
  hasName,
  hasFields,
  hasMutable,
  getProp,
  isArrayInstance,
} from "../types";
import { Env, envHas, envGet, envEntries } from "../env";

/**
 * Context for resolving operands - provides access to the environment
 * and the recursive evaluator
 */
export interface OperandResolutionContext {
  localEnv: Env;
  getBindingTarget: (name: string) => { binding: unknown; targetVal: unknown };
  evaluateExpr: (expr: string, env: Env) => unknown;
}

/**
 * Resolve an address-of operand to a pointer object
 */
export function resolveAddressOf(
  op: unknown,
  ctx: OperandResolutionContext
): { [k: string]: unknown } | undefined {
  if (!isPlainObject(op) || !hasAddrOf(op)) return undefined;

  const inner = op.addrOf;
  if (!isPlainObject(inner) || !hasIdent(inner))
    throw new Error("& must be applied to identifier");
  const n = inner.ident;
  if (typeof n !== "string") throw new Error("& must be applied to identifier");

  const { binding: targetBinding, targetVal } = ctx.getBindingTarget(n);
  const ptrObj: { [k: string]: unknown } = { ptrName: n, pointer: true };

  // If the address-of targets an array instance, mark this pointer as a slice
  // and carry the target mutability so writes through the pointer can be validated.
  if (isArrayInstance(targetVal)) {
    ptrObj.ptrIsSlice = true;
    ptrObj.ptrMutable =
      isPlainObject(targetBinding) && hasMutable(targetBinding)
        ? targetBinding.mutable === true
        : false;
  }
  if (isPlainObject(targetVal) && hasKindBits(targetVal)) {
    ptrObj.kind = targetVal.kind;
    ptrObj.bits = targetVal.bits;
    if (hasValue(targetVal)) ptrObj.valueBig = targetVal.value;
  } else if (isIntOperand(targetVal)) {
    ptrObj.valueBig = targetVal.valueBig;
  } else if (isFloatOperand(targetVal)) {
    ptrObj.isFloat = true;
    ptrObj.floatValue = targetVal.floatValue;
  } else if (isBoolOperand(targetVal)) {
    ptrObj.ptrIsBool = true;
    ptrObj.boolValue = targetVal.boolValue;
  } else if (typeof targetVal === "number") {
    // plain numeric -> treat as integer literal-like
    ptrObj.valueBig = BigInt(targetVal);
  }
  return ptrObj;
}

/**
 * Resolve a dereference operand to the value pointed to
 */
export function resolveDereference(
  op: unknown,
  ctx: OperandResolutionContext
): unknown {
  if (!isPlainObject(op) || !hasDeref(op)) return undefined;

  const inner = op.deref;
  // deref of an identifier that holds a pointer
  if (isPlainObject(inner) && hasIdent(inner)) {
    const n = inner.ident;
    if (typeof n !== "string") throw new Error("invalid deref target");
    const { targetVal: val } = ctx.getBindingTarget(n);
    if (!isPointer(val)) throw new Error("cannot dereference non-pointer");
    const targetName = val.ptrName;
    const { targetVal } = ctx.getBindingTarget(targetName);
    return targetVal;
  }
  // deref of an inline &expr like *(&x)
  if (isPlainObject(inner) && hasAddrOf(inner)) {
    const inr = inner.addrOf;
    if (!isPlainObject(inr) || !hasIdent(inr))
      throw new Error("& must be applied to identifier");
    const n = inr.ident;
    if (typeof n !== "string")
      throw new Error("& must be applied to identifier");
    const { targetVal } = ctx.getBindingTarget(n);
    return targetVal;
  }
  throw new Error("invalid dereference target");
}

/**
 * Resolve a struct instantiation operand
 */
export function resolveStructInstantiation(
  op: unknown,
  ctx: OperandResolutionContext
): unknown {
  if (!isPlainObject(op) || !hasStructInstantiation(op)) return undefined;

  const si = op.structInstantiation;
  if (!isPlainObject(si)) throw new Error("invalid struct instantiation");
  if (!hasName(si) || typeof si.name !== "string")
    throw new Error("invalid struct instantiation");
  const structName = si.name;
  if (!hasFields(si) || !Array.isArray(si.fields))
    throw new Error("invalid struct instantiation");
  const fieldParts = si.fields;

  // Look up struct definition
  if (!envHas(ctx.localEnv, structName))
    throw new Error(`unknown struct ${structName}`);
  const structDef = envGet(ctx.localEnv, structName);
  if (!isStructDef(structDef)) throw new Error(`${structName} is not a struct`);

  // Evaluate field values
  const fieldValues: { [k: string]: unknown } = {};
  const providedFields = new Set<string>();

  for (const fieldPart of fieldParts) {
    if (!isPlainObject(fieldPart))
      throw new Error("invalid struct field initializer");
    if (
      !hasName(fieldPart) ||
      typeof fieldPart.name !== "string" ||
      !hasValue(fieldPart) ||
      typeof fieldPart.value !== "string"
    )
      throw new Error("invalid struct field initializer");
    const fieldName = fieldPart.name;
    const fieldValueExpr = fieldPart.value;
    const fieldValue = ctx.evaluateExpr(fieldValueExpr, ctx.localEnv);

    // Check for duplicate fields
    if (providedFields.has(fieldName))
      throw new Error(`duplicate field ${fieldName}`);
    providedFields.add(fieldName);
    fieldValues[fieldName] = fieldValue;
  }

  // Validate all required fields are provided
  (function validateStructFields(
    def: unknown,
    provided: Set<string>,
    structName: string
  ) {
    if (!hasFields(def) || !Array.isArray(def.fields))
      throw new Error("invalid struct definition");
    const structFields = def.fields;
    for (const field of structFields) {
      if (!isPlainObject(field)) throw new Error("invalid struct definition");
      if (
        !hasName(field) ||
        typeof field.name !== "string" ||
        !hasAnnotation(field) ||
        typeof field.annotation !== "string"
      )
        throw new Error("invalid struct definition");
      const fieldName = field.name;
      const annotationRaw = field.annotation;
      if (!provided.has(fieldName))
        throw new Error(`missing field ${fieldName} in struct ${structName}`);
      // For struct fields, just validate that the type annotation is recognized
      // but don't require literal value matching (different from let bindings)
      const annotation = annotationRaw.trim();
      if (!/^[*]?([a-zA-Z_]\w*)(?:\d+)?$/.test(annotation)) {
        throw new Error(`invalid type annotation for field ${fieldName}`);
      }
    }
  })(structDef, providedFields, structName);

  // Create struct instance
  return {
    isStructInstance: true,
    structName,
    fieldValues,
  };
}

/**
 * Resolve an array literal operand to an array instance
 */
export function resolveArrayLiteral(
  op: unknown,
  ctx: OperandResolutionContext
): unknown {
  if (!isPlainObject(op) || !("arrayLiteral" in op)) return undefined;

  const arrLit = getProp(op, "arrayLiteral");
  if (!Array.isArray(arrLit)) throw new Error("invalid array literal");
  const elems: unknown[] = arrLit.map((part) => {
    if (typeof part !== "string")
      throw new Error("invalid array literal element");
    return ctx.evaluateExpr(part, ctx.localEnv);
  });
  return {
    isArray: true,
    elements: elems,
    length: elems.length,
    initializedCount: elems.length,
  };
}

/**
 * Resolve a grouped expression operand
 */
export function resolveGroupedExpr(
  op: unknown,
  ctx: OperandResolutionContext
): unknown {
  if (!isPlainObject(op) || !("groupedExpr" in op)) return undefined;

  const ge = getProp(op, "groupedExpr");
  if (typeof ge !== "string") throw new Error("invalid grouped expression");
  return ctx.evaluateExpr(ge, ctx.localEnv);
}

// Sentinel value to indicate the operand was not resolved
const NOT_RESOLVED = Symbol("NOT_RESOLVED");

/**
 * Resolve an identifier operand, including special 'this' handling
 * Returns NOT_RESOLVED sentinel if the operand is not an identifier
 */
export function resolveIdentifier(
  op: unknown,
  ctx: OperandResolutionContext
): unknown {
  if (!isPlainObject(op) || !hasIdent(op)) return NOT_RESOLVED;

  const n = op.ident;
  if (typeof n !== "string") return NOT_RESOLVED;

  // Special handling for 'this' binding
  if (n === "this") {
    // If `this` is explicitly bound in the environment, return it directly
    if (envHas(ctx.localEnv, "this")) return envGet(ctx.localEnv, "this");

    const thisObj: {
      isThisBinding: true;
      fieldValues: { [k: string]: unknown };
    } = { isThisBinding: true, fieldValues: {} };
    // Build fieldValues from current localEnv
    for (const [key, value] of envEntries(ctx.localEnv)) {
      if (key !== "this") {
        if (
          isPlainObject(value) &&
          hasValue(value) &&
          value.value !== undefined
        ) {
          thisObj.fieldValues[key] = value.value;
        } else if (
          typeof value === "number" ||
          typeof value === "string" ||
          typeof value === "boolean"
        ) {
          thisObj.fieldValues[key] = value;
        } else if (!isStructDef(value)) {
          thisObj.fieldValues[key] = value;
        }
      }
    }
    return thisObj;
  }

  // Type name placeholder
  if (!envHas(ctx.localEnv, n)) {
    if (/^\*?([uUiI]\d+|Bool)$/i.test(n)) {
      return { typeName: n };
    }
    throw new Error(`unknown identifier ${n}`);
  }

  const { targetVal: val } = ctx.getBindingTarget(n);
  if (isPlainObject(val) && hasValue(val) && val.value !== undefined)
    return val.value;
  return val;
}

/**
 * Check if result is the NOT_RESOLVED sentinel
 */
export function isNotResolved(val: unknown): val is typeof NOT_RESOLVED {
  return val === NOT_RESOLVED;
}
