// A minimal type system for Tuff.

export type Type =
  | { kind: "Number" }
  | { kind: "U8" }
  | { kind: "U16" }
  | { kind: "U32" }
  | { kind: "Str" }
  | { kind: "Ref"; inner: Type }
  | { kind: "Array"; inner: Type };

export const NumberType: Type = { kind: "Number" };
export const U8Type: Type = { kind: "U8" };
export const U16Type: Type = { kind: "U16" };
export const U32Type: Type = { kind: "U32" };
export const StrType: Type = { kind: "Str" };

export function ref(inner: Type): Type {
  return { kind: "Ref", inner };
}

export function array(inner: Type): Type {
  return { kind: "Array", inner };
}

export function typeToString(type: Type): string {
  switch (type.kind) {
    case "Number":
      return "Num";
    case "U8":
      return "U8";
    case "U16":
      return "U16";
    case "U32":
      return "U32";
    case "Str":
      return "Str";
    case "Ref":
      return `&${typeToString(type.inner)}`;
    case "Array":
      return `[${typeToString(type.inner)}]`;
  }
}
