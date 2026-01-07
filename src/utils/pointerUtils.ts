import { Result, ok, err, isErr } from "../result";
import { getAddressInfo } from "../pointers";
import { Binding } from "../matchEval";

export function validatePointerInit(
  typeName: string,
  val: unknown
): Result<void, string> {
  if (typeof val !== "number") return err("Invalid pointer assignment");
  const addrInfo = getAddressInfo(val);
  if (!addrInfo) return err("Invalid pointer assignment");
  const declaredIsMut = typeName.startsWith("*mut");
  const baseType = declaredIsMut
    ? typeName.replace(/^\*mut\s*/, "")
    : typeName.replace(/^\*\s*/, "");
  if (addrInfo.baseType !== baseType) return err("Pointer base type mismatch");
  if (declaredIsMut && !addrInfo.targetMutable)
    return err("Pointer mutability mismatch");
  return ok(undefined);
}

export function finalizeLet(
  name: string,
  mutable: boolean,
  typeName: string | undefined,
  val: number,
  envMap: Map<string, Binding>
) {
  if (typeName && typeName.startsWith("*")) {
    const pRes = validatePointerInit(typeName, val);
    if (isErr(pRes)) return err(pRes.error);
  }
  if (typeName === "I32") val = Math.trunc(val);
  else if (typeName === "Bool") val = val !== 0 ? 1 : 0;
  envMap.set(name, { type: "var", value: val, mutable, typeName });
  return ok(undefined);
}
