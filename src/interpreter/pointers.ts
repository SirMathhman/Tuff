import type { Env, PointerValue, ArrayValue, SliceValue } from "./types";
import { isIdentifierName } from "./shared";
import type { EnvItem } from "./types";

import { hasTypeTag, ensureExistsInEnv, resolveTypeAlias } from "./shared";
import { isArrayValue } from "./arrays";

export function isPointerValue(v: unknown): v is PointerValue {
  return hasTypeTag(v, "Pointer");
}

interface MutParseResult {
  mut: boolean;
  rest: string;
}

function parseMutPrefix(s: string): MutParseResult {
  if (s.startsWith("mut ")) return { mut: true, rest: s.slice(4).trim() };
  return { mut: false, rest: s };
}
export function tryHandleAddressOf(
  s: string,
  env?: Env
): PointerValue | undefined {
  const ss = s.trim();
  if (!ss.startsWith("&")) return undefined;
  let rest = ss.slice(1).trim();
  const parsed = parseMutPrefix(rest);
  const pointeeMutable = parsed.mut;
  rest = parsed.rest;
  // only support simple identifier address-of for now
  if (!isIdentifierName(rest)) return undefined;
  if (!env || !env.has(rest)) throw new Error("Unknown identifier");
  const item = env.get(rest)!;
  if (item.moved) throw new Error("Use-after-move");
  // if requested mutw  , ensure the target is mutable
  if (pointeeMutable && !item.mutable)
    throw new Error("Cannot take mutable reference to immutable variable");
  // return a pointer value referencing the env and name
  const rawType = item.type;
  const pointeeType = rawType === "Number" || !rawType ? "I32" : rawType;
  return {
    type: "Pointer",
    env: env,
    name: rest,
    pointeeType,
    pointeeMutable,
  } as PointerValue;
}

export function tryHandleDerefExpression(
  s: string,
  env?: Env
): number | undefined {
  const ss = s.trim();
  if (!ss.startsWith("*")) return undefined;
  const rest = ss.slice(1).trim();
  // deref of address-of inlined: *(&x)
  if (rest.startsWith("&")) {
    const ptr = tryHandleAddressOf(rest, env);
    if (!ptr) return undefined;
    const pointee = ptr.env.get(ptr.name)!;
    if (pointee.moved) throw new Error("Use-after-move");
    if (typeof pointee.value !== "number")
      throw new Error("Cannot dereference non-number");
    return pointee.value as number;
  }

  // deref of identifier holding a pointer
  if (isIdentifierName(rest)) {
    if (!env || !env.has(rest)) throw new Error("Unknown identifier");
    const item = env.get(rest)!;
    if (!isPointerValue(item.value)) return undefined;
    const ptr = item.value as PointerValue;
    const pointee = ptr.env.get(ptr.name)!;
    if (pointee.moved) throw new Error("Use-after-move");
    if (typeof pointee.value !== "number")
      throw new Error("Cannot dereference non-number");
    return pointee.value as number;
  }

  return undefined;
}

export function tryHandlePointerAssignment(
  stmt: string,
  env: Env,
  interpret: (input: string, env?: Env) => unknown
): number | undefined {
  // Pattern: *ident = expr
  const eqIdx = stmt.indexOf("=");
  if (eqIdx === -1) return undefined;
  const lhs = stmt.slice(0, eqIdx).trim();
  const rhs = stmt.slice(eqIdx + 1).trim();
  if (!lhs.startsWith("*")) return undefined;
  const rest = lhs.slice(1).trim();
  if (!isIdentifierName(rest)) return undefined;
  if (!env || !env.has(rest)) throw new Error("Unknown identifier");
  const item = env.get(rest)!;
  if (!isPointerValue(item.value)) return undefined;
  const ptr = item.value as PointerValue;
  const pointeeItem = ptr.env.get(ptr.name)!;
  if (pointeeItem.moved) throw new Error("Use-after-move");
  // require that the pointer itself is a mutable pointer (taken as &mut) or the pointee is mutable
  if (!ptr.pointeeMutable && !pointeeItem.mutable)
    throw new Error("Cannot assign through pointer to immutable variable");

  const value = interpret(rhs, env);
  if (typeof value !== "number")
    throw new Error("Cannot assign non-number through pointer");
  pointeeItem.value = value as number;
  ptr.env.set(ptr.name, pointeeItem);
  return value as number;
}

// eslint-disable-next-line max-lines-per-function
export function handlePointerInitializer(
  initializer: string,
  annotatedType: string | undefined,
  name: string,
  mutable: boolean,
  env: Env
): boolean {
  if (!initializer.startsWith("&")) return false;
  const ptr = tryHandleAddressOf(initializer, env);
  if (!ptr) throw new Error("Invalid address-of expression");

  // Support slice creation when annotated type is *[T] or *mut [T]
  if (annotatedType) {
    const resolvedAnnotatedType = resolveTypeAlias(annotatedType, env);
    if (resolvedAnnotatedType.startsWith("*")) {
      // parse annotated mutability and slice element type
      let annotatedPointee = resolvedAnnotatedType.slice(1).trim();
      const parsed = parseMutPrefix(annotatedPointee);
      const annotatedMut = parsed.mut;
      annotatedPointee = parsed.rest;
      if (!annotatedPointee.startsWith("[")) {
        // not a slice, fall back to pointer handling below
      } else {
        const inner = annotatedPointee.slice(1).trim();
        if (!inner.endsWith("]"))
          throw new Error("Invalid slice type annotation");
        const elemType = inner.slice(0, -1).trim();

        createSliceFromArray(
          ptr,
          elemType,
          name,
          resolvedAnnotatedType,
          env,
          annotatedMut
        );
        return true;
      }

      // pointer type: check inner match
      let annotatedPointee2 = resolvedAnnotatedType.slice(1).trim();
      const parsed2 = parseMutPrefix(annotatedPointee2);
      const annotatedMut2 = parsed2.mut;
      annotatedPointee2 = parsed2.rest;
      if (
        resolveTypeAlias(annotatedPointee2, env) !==
        resolveTypeAlias(ptr.pointeeType as string, env)
      )
        throw new Error("Pointer type mismatch");
      if (annotatedMut2 !== !!ptr.pointeeMutable)
        throw new Error("Pointer mutability mismatch");
    } else {
      // annotated type is an alias that doesn't resolve to a pointer type
      throw new Error("Type mismatch: expected pointer type");
    }
  }
  const itemOut: EnvItem = {
    value: ptr,
    mutable,
    type: annotatedType || `*${ptr.pointeeType}`,
  } as EnvItem;
  env.set(name, itemOut);
  return true;
}

function createSliceFromArray(
  ptr: PointerValue,
  elemType: string,
  name: string,
  annotatedType: string,
  env: Env,
  annotatedMut = false
) {
  ensureExistsInEnv(ptr.name, env);
  const item = env.get(ptr.name)!;
  if (!isArrayValue(item.value))
    throw new Error("Slice initializer must reference an array");
  const arr = item.value as ArrayValue;
  if (
    resolveTypeAlias(arr.elementType, env) !== resolveTypeAlias(elemType, env)
  )
    throw new Error("Slice type mismatch");

  // If annotation requests mutable slice, require the initializer to be &mut
  if (annotatedMut && !ptr.pointeeMutable)
    throw new Error("Pointer mutability mismatch");

  // allow &mut initializer to create an immutable slice (coercion)
  const finalMutable = !!annotatedMut;

  if (finalMutable) {
    if (!item.mutable)
      throw new Error("Cannot take mutable reference to immutable variable");
    // ensure no existing borrows
    const existing = findSlicesReferencing(arr, env);
    if (existing.length > 0)
      throw new Error("Cannot take mutable reference while borrow(s) exist");
  } else {
    // ensure no mutable borrow exists
    const existing = findSlicesReferencing(arr, env);
    if (existing.some((b) => b.mutable))
      throw new Error(
        "Cannot take immutable slice while mutable borrow exists"
      );
  }

  const slice = {
    type: "Slice",
    elementType: elemType,
    backing: arr,
    start: 0,
    length: arr.length,
    mutable: finalMutable,
  } as const;

  const out: EnvItem = {
    value: slice as unknown as EnvItem["value"],
    mutable: false,
    type: annotatedType,
  } as EnvItem;
  env.set(name, out);
}

interface NamedSlice extends SliceValue {
  name: string;
}

export function findSlicesReferencing(arr: ArrayValue, env: Env): NamedSlice[] {
  const out: NamedSlice[] = [];
  for (const [k, v] of env.entries()) {
    if (hasTypeTag(v.value, "Slice")) {
      const sv = v.value as SliceValue;
      if (sv.backing === arr)
        out.push({ ...(sv as SliceValue), name: k } as NamedSlice);
    }
  }
  return out;
}
