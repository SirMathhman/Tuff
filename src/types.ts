import type { Env } from "./env";

// Forward declare PlainObject to avoid circular reference issues
export interface PlainObject {
  [k: string]: RuntimeValue;
}

// Runtime value type - represents any value that can exist at runtime in the interpreter
// This is a union of all possible runtime value types
// Note: 'unknown' is included because Env uses unknown to avoid circular dependencies
export type RuntimeValue =
  | string
  | number
  | bigint
  | boolean
  | undefined
  | null
  | unknown
  | Env
  | BoolOperand
  | FloatOperand
  | IntOperand
  | FnWrapper
  | ThisBinding
  | StructInstance
  | StructDef
  | ArrayInstance
  | ArrayLiteral
  | Pointer
  | KindBits
  | Ident
  | AddrOf
  | Deref
  | CallArgs
  | CallApp
  | StructInstantiation
  | Value
  | Mutable
  | Uninitialized
  | Annotation
  | ParsedAnnotation
  | LiteralAnnotation
  | Params
  | ClosureEnv
  | Body
  | IsBlock
  | Name
  | Fields
  | PtrMutable
  | PtrIsBool
  | Yield
  | PlainObject
  | RuntimeValue[];

export interface BoolOperand {
  boolValue: boolean;
}

export interface FloatOperand {
  isFloat: true;
  floatValue: number;
}

export interface IntOperand {
  valueBig: bigint;
}

export interface FnWrapper {
  fn: PlainObject;
}

export interface ThisBinding {
  isThisBinding: true;
  fieldValues: PlainObject;
}

export interface StructInstance {
  isStructInstance: true;
  fieldValues: PlainObject;
}

export interface StructDef {
  isStructDef: true;
}

export interface ArrayInstance {
  isArray: true;
  elements: RuntimeValue[];
  length: number;
  initializedCount: number;
  elemType?: string;
}

export interface ArrayLiteral {
  arrayLiteral: string[];
}

export interface Pointer {
  pointer: true;
  ptrName: string;
}

export interface KindBits {
  kind: string;
  bits: number;
}

export interface Ident {
  ident: string;
}

export interface AddrOf {
  addrOf: RuntimeValue;
}

export interface Deref {
  deref: RuntimeValue;
}

export interface CallArgs {
  callArgs: RuntimeValue[];
}

export interface CallApp {
  callApp: RuntimeValue;
}

export interface StructInstantiation {
  structInstantiation: RuntimeValue;
}

export interface Value {
  value: RuntimeValue;
}

export interface Mutable {
  mutable: RuntimeValue;
}

export interface Uninitialized {
  uninitialized: boolean;
}

export interface Annotation {
  annotation: string;
}

export interface ParsedAnnotation {
  parsedAnnotation: PlainObject;
}

export interface LiteralAnnotation {
  literalAnnotation: string;
}

export interface Params {
  params: string[];
}

export interface ClosureEnv {
  closureEnv: Env;
}

export interface Body {
  body: string;
}

export interface IsBlock {
  isBlock: boolean;
}

export interface Name {
  name: string;
}

export interface Fields {
  fields: PlainObject;
}

export interface PtrMutable {
  ptrMutable: boolean;
}

export interface PtrIsBool {
  ptrIsBool: boolean;
}

export interface Yield {
  __yield: number;
}

export function isPlainObject(v: unknown): v is PlainObject {
  // Use `!= undefined` to exclude both `undefined` and `null` without using
  // the `null` literal (ESLint rule bans null literals).
  return typeof v === "object" && v != undefined;
}

export function isBoolOperand(v: unknown): v is BoolOperand {
  return (
    isPlainObject(v) && "boolValue" in v && typeof v.boolValue === "boolean"
  );
}

export function isFloatOperand(v: unknown): v is FloatOperand {
  return (
    isPlainObject(v) &&
    "isFloat" in v &&
    v.isFloat === true &&
    "floatValue" in v &&
    typeof v.floatValue === "number"
  );
}

export function isIntOperand(v: unknown): v is IntOperand {
  return isPlainObject(v) && "valueBig" in v && typeof v.valueBig === "bigint";
}

export function isFnWrapper(v: unknown): v is FnWrapper {
  return isPlainObject(v) && "fn" in v && isPlainObject(v.fn);
}

export function isThisBinding(v: unknown): v is ThisBinding {
  return (
    isPlainObject(v) &&
    "isThisBinding" in v &&
    v.isThisBinding === true &&
    "fieldValues" in v &&
    isPlainObject(v.fieldValues)
  );
}

export function isStructInstance(v: unknown): v is StructInstance {
  return (
    isPlainObject(v) &&
    "isStructInstance" in v &&
    v.isStructInstance === true &&
    "fieldValues" in v &&
    isPlainObject(v.fieldValues)
  );
}

export function isStructDef(v: unknown): v is StructDef {
  return isPlainObject(v) && "isStructDef" in v && v.isStructDef === true;
}

// Array runtime instance: { isArray: true, elements: unknown[], length: number, initializedCount: number }
export function isArrayInstance(v: unknown): v is ArrayInstance {
  if (!isPlainObject(v)) return false;
  if (!("isArray" in v) || v.isArray !== true) return false;
  const elements = getProp(v, "elements");
  const length = getProp(v, "length");
  const initializedCount = getProp(v, "initializedCount");
  return (
    Array.isArray(elements) &&
    typeof length === "number" &&
    typeof initializedCount === "number"
  );
}

// parse-time array literal placeholder shape
export function hasArrayLiteral(v: unknown): v is ArrayLiteral {
  if (!isPlainObject(v)) return false;
  const arr = getProp(v, "arrayLiteral");
  return Array.isArray(arr);
}

export function isPointer(v: unknown): v is Pointer {
  return (
    isPlainObject(v) &&
    "pointer" in v &&
    v.pointer === true &&
    "ptrName" in v &&
    typeof v.ptrName === "string"
  );
}

export function unwrapBindingValue(binding: RuntimeValue): RuntimeValue {
  if (!isPlainObject(binding)) return binding;
  if (!Object.prototype.hasOwnProperty.call(binding, "value")) return binding;
  const v = binding.value;
  return v !== undefined ? v : binding;
}

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Helper to throw a consistent uninitialized-variable error
export function throwUseOfUninitialized(name: string): never {
  throw new Error(`use of uninitialized variable ${name}`);
}

// Helper to validate integer value fits in a typed integer range
export function checkRange(kind: string, bits: number, sum: bigint) {
  if (kind === "u") {
    const max = (1n << BigInt(bits)) - 1n;
    if (sum < 0n || sum > max)
      throw new Error(`value out of range for U${bits}`);
  } else {
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (sum < min || sum > max)
      throw new Error(`value out of range for I${bits}`);
  }
}

// Safe property getters - avoid `as` casts by using `in` checks
export function getProp(obj: unknown, key: string): RuntimeValue {
  if (!isPlainObject(obj)) return undefined;
  if (!(key in obj)) return undefined;
  return obj[key];
}

export function hasProp(obj: unknown, key: string): boolean {
  return isPlainObject(obj) && key in obj;
}

export function hasStringProp(obj: unknown, key: string): boolean {
  return isPlainObject(obj) && key in obj && typeof obj[key] === "string";
}

// Type guards for common property shapes
export function hasKindBits(v: unknown): v is KindBits {
  return (
    isPlainObject(v) &&
    "kind" in v &&
    typeof v.kind === "string" &&
    "bits" in v &&
    typeof v.bits === "number"
  );
}

export function hasIdent(v: unknown): v is Ident {
  return isPlainObject(v) && "ident" in v && typeof v.ident === "string";
}

export function hasAddrOf(v: unknown): v is AddrOf {
  return isPlainObject(v) && "addrOf" in v;
}

export function hasDeref(v: unknown): v is Deref {
  return isPlainObject(v) && "deref" in v;
}

export function hasCallArgs(v: unknown): v is CallArgs {
  return isPlainObject(v) && "callArgs" in v && Array.isArray(v.callArgs);
}

export function hasCallApp(v: unknown): v is CallApp {
  return isPlainObject(v) && "callApp" in v;
}

export function hasStructInstantiation(v: unknown): v is StructInstantiation {
  return isPlainObject(v) && "structInstantiation" in v;
}

export function hasValue(v: unknown): v is Value {
  return isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, "value");
}

export function hasMutable(v: unknown): v is Mutable {
  return isPlainObject(v) && "mutable" in v;
}

export function hasUninitialized(v: unknown): v is Uninitialized {
  return isPlainObject(v) && "uninitialized" in v;
}

export function hasAnnotation(v: unknown): v is Annotation {
  return isPlainObject(v) && "annotation" in v;
}

export function hasParsedAnnotation(v: unknown): v is ParsedAnnotation {
  return isPlainObject(v) && "parsedAnnotation" in v;
}

export function hasLiteralAnnotation(v: unknown): v is LiteralAnnotation {
  return isPlainObject(v) && "literalAnnotation" in v;
}

export function hasParams(v: unknown): v is Params {
  return isPlainObject(v) && "params" in v && Array.isArray(v.params);
}

export function hasClosureEnv(v: unknown): v is ClosureEnv {
  return isPlainObject(v) && "closureEnv" in v;
}

export function hasBody(v: unknown): v is Body {
  return isPlainObject(v) && "body" in v;
}

export function hasIsBlock(v: unknown): v is IsBlock {
  return isPlainObject(v) && "isBlock" in v;
}

export function hasName(v: unknown): v is Name {
  return isPlainObject(v) && "name" in v;
}

export function hasFields(v: unknown): v is Fields {
  return isPlainObject(v) && "fields" in v;
}

export function hasPtrMutable(v: unknown): v is PtrMutable {
  return isPlainObject(v) && "ptrMutable" in v;
}

export function hasPtrIsBool(v: unknown): v is PtrIsBool {
  return isPlainObject(v) && "ptrIsBool" in v;
}

export function hasYield(v: unknown): v is Yield {
  return isPlainObject(v) && "__yield" in v && typeof v.__yield === "number";
}

// Setter helpers - avoid `as` type assertions by using Object.defineProperty
// These functions mutate properties on objects that have been verified via type guards.

export function setValue(obj: Value, val: unknown): void {
  Object.defineProperty(obj, "value", {
    value: val,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function setUninitialized(obj: Uninitialized, val: boolean): void {
  Object.defineProperty(obj, "uninitialized", {
    value: val,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export type InterpretFn = (_input: string, _env?: Env) => number;
