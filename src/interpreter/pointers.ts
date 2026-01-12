import type { Env, PointerValue } from "./types";
import { isIdentifierName } from "./shared";
import type { EnvItem } from "./types";

import { hasTypeTag } from "./shared";

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
  // require that the pointer itself is a mutable pointer (taken as &mut) or the pointee is mutable
  if (!ptr.pointeeMutable && !pointeeItem.mutable)
    throw new Error("Cannot assign through pointer to immutable variable");

  const value = interpret(rhs, env);
  if (typeof value !== "number") throw new Error("Cannot assign non-number through pointer");
  pointeeItem.value = value as number;
  ptr.env.set(ptr.name, pointeeItem);
  return value as number;
}

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
  if (annotatedType) {
    if (!annotatedType.startsWith("*"))
      throw new Error("Type mismatch: expected pointer type");
    // parse annotated pointer mutability
    let annotatedPointee = annotatedType.slice(1).trim();
    const parsed = parseMutPrefix(annotatedPointee);
    const annotatedMut = parsed.mut;
    annotatedPointee = parsed.rest;
    if (annotatedPointee !== ptr.pointeeType)
      throw new Error("Pointer type mismatch");
    if (annotatedMut !== !!ptr.pointeeMutable)
      throw new Error("Pointer mutability mismatch");
  }
  const item: EnvItem = {
    value: ptr,
    mutable,
    type: annotatedType || `*${ptr.pointeeType}`,
  } as EnvItem;
  env.set(name, item);
  return true;
}
