import type { Result } from "../helpers/result";
import type { BindingLike } from "../helpers/assignHelpers";
import { lookupBinding } from "../control/ifValidators";

export interface ScannedIdent { name: string; next: number }
export interface ScannedResult { out: string; nextPos: number }

interface StructValueLike { fields: Map<string, BindingLike> }
interface MaybeStructBinding { struct?: StructValueLike }

import { isIdentifierName, SIZED_TYPES } from "./interpretHelpers";

export function lookupAndFormatSubstIdent(
  name: string,
  reserved: Set<string>,
  envLocal: Map<string, BindingLike>,
  parentEnvLocal: Map<string, BindingLike> | undefined
): Result<string, string> {
  // Light-weight reimplementation (moved from interpretHelpers)
  if (!isIdentifierName(name) || reserved.has(name) || SIZED_TYPES.has(name))
    return { ok: true, value: name };

  const b = lookupBinding(name, envLocal, parentEnvLocal);
  if (!b.ok) return { ok: false, error: b.error };
  return {
    ok: true,
    value: String(b.value.value) + (b.value.suffix ? b.value.suffix : ""),
  };
}

export function handleScannedIdent(
  scanned: ScannedIdent,
  src: string,
  reserved: Set<string>,
  envLocal: Map<string, BindingLike>,
  parentEnvLocal: Map<string, BindingLike> | undefined
): Result<ScannedResult, string> {
  const { name, next } = scanned;
  // function/constructor call: leave as-is (hand off to call handler later)
  if (next < src.length && src[next] === "(") {
    return { ok: true, value: { out: name, nextPos: next } };
  }

  // member access: name.field
  if (next < src.length && src[next] === ".") {
    const fieldScan = (() => {
      let p = next + 1;
      const start = p;
      while (p < src.length) {
        const cc = src.charCodeAt(p);
        const ok = (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 95;
        if (!ok) break;
        p++;
      }
      return p === start ? undefined : { name: src.slice(start, p), next: p } as ScannedIdent;
    })();
    if (!fieldScan) return { ok: false, error: "invalid member access" };
    const field = fieldScan.name;
    const b = lookupBinding(name, envLocal, parentEnvLocal);
    if (!b.ok) return { ok: false, error: b.error };
    const structVal = (b.value as unknown as MaybeStructBinding).struct;
    if (!structVal) return { ok: false, error: `unknown identifier ${name}` };
    const f = structVal.fields.get(field);
    if (!f) return { ok: false, error: `unknown field ${field}` };
    return {
      ok: true,
      value: { out: String(f.value) + (f.suffix ? f.suffix : ""), nextPos: fieldScan.next },
    };
  }

  const res = lookupAndFormatSubstIdent(name, reserved, envLocal, parentEnvLocal);
  if (!res.ok) return res as Result<ScannedResult, string>;
  return { ok: true, value: { out: res.value, nextPos: next } };
}
