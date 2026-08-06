import type { Value } from "./types";

export function num(v: number, type?: string): Value {
  return { tag: "number", num: v, type };
}

export function bool(v: boolean): Value {
  return { tag: "bool", val: v };
}

export function toNum(v: Value): number {
  switch (v.tag) {
    case "number":
      return v.num;
    case "bool":
      return v.val ? 1 : 0;
    case "ref":
      return toNum(v.scope.vars[v.name]!);
    case "tuple":
      return 0;
    case "null":
      return 0;
    case "array":
      return 0;
    case "string":
      return v.value.charCodeAt(0);
    case "record":
      return 0;
    default:
      throw new Error(`cannot convert ${v.tag} to number`);
  }
}

export function truthy(v: Value): boolean {
  return toNum(v) !== 0;
}

function eqValues(a: Value[], b: Value[]): boolean {
  return a.length === b.length && a.every((v, i) => truthy(eq(v, b[i]!)));
}

export function eq(a: Value, b: Value): Value {
  if (a.tag !== b.tag) return bool(false);
  switch (a.tag) {
    case "number":
      return bool(a.num === (b as Extract<Value, { tag: "number" }>).num);
    case "bool":
      return bool(a.val === (b as Extract<Value, { tag: "bool" }>).val);
    case "string":
      return bool(a.value === (b as Extract<Value, { tag: "string" }>).value);
    case "array":
      return bool(eqValues(a.values, (b as Extract<Value, { tag: "array" }>).values));
    case "tuple":
      return bool(eqValues(a.values, (b as Extract<Value, { tag: "tuple" }>).values));
    default:
      return bool(false);
  }
}

export function ne(a: Value, b: Value): Value {
  return bool(!truthy(eq(a, b)));
}

function cmp(a: Value, b: Value): number {
  if (a.tag === "string" && b.tag === "string") {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }
  return toNum(a) - toNum(b);
}

export function lt(a: Value, b: Value): Value {
  return bool(cmp(a, b) < 0);
}

export function lte(a: Value, b: Value): Value {
  return bool(cmp(a, b) <= 0);
}

export function gt(a: Value, b: Value): Value {
  return bool(cmp(a, b) > 0);
}

export function gte(a: Value, b: Value): Value {
  return bool(cmp(a, b) >= 0);
}

export function notOp(v: Value): Value {
  return bool(!truthy(v));
}

export function applyBinOp(op: string, left: Value, right: Value): Value {
  switch (op) {
    case "+":
      return num(toNum(left) + toNum(right));
    case "-":
      return num(toNum(left) - toNum(right));
    case "*":
      return num(toNum(left) * toNum(right));
    case "/":
      return num(toNum(left) / toNum(right));
    case "%":
      return num(toNum(left) % toNum(right));
    case "||":
      return bool(truthy(left) || truthy(right));
    case "&&":
      return bool(truthy(left) && truthy(right));
    case "==":
      return eq(left, right);
    case "!=":
      return bool(!truthy(eq(left, right)));
    case "<":
      return lt(left, right);
    case "<=":
      return lte(left, right);
    case ">":
      return gt(left, right);
    case ">=":
      return gte(left, right);
    default:
      throw new Error(`unknown operator: ${op}`);
  }
}
