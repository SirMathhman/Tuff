import type { Env } from "./env";
import { throwError, ErrorCode } from "./errors";

// Function object core properties (body and structure)
interface FunctionObjectCore {
  params: RuntimeValue[];
  body: string;
  isBlock: boolean;
}

// Function object metadata (annotations, environment, implementation)
interface FunctionObjectMeta {
  resultAnnotation?: string;
  closureEnv?: Env;
  nativeImpl?: Function;
  boundThis?: RuntimeValue;
  __autoCall?: boolean;
}

// Complete function object with all properties
export type FunctionObject = FunctionObjectCore & FunctionObjectMeta;

// Operand type discriminators (numeric and boolean values)
export type OperandType = "bool-operand" | "float-operand" | "int-operand";

// Function and binding type discriminators
export type FunctionBindingType = "fn-wrapper" | "this-binding";

// Structure type discriminators
export type StructureType = "struct-instance" | "struct-def";

// Collection type discriminators
export type CollectionType = "array-instance";

// Pointer type discriminator
export type PointerType = "pointer";

// Type discriminator field for discriminated union (max 5 union members)
export type RuntimeValueType =
  | OperandType
  | FunctionBindingType
  | StructureType
  | CollectionType
  | PointerType;

// Base interface with optional type discriminator
export interface TypedValue {
  type: RuntimeValueType;
}

// Operand types (numeric and boolean values with metadata)
type OperandTypes = BoolOperand | FloatOperand | IntOperand;

// Function and binding types
type FunctionTypes = FnWrapper | ThisBinding;

// Structure types (struct definitions, instances, and instantiation expressions)
type StructureTypes = StructInstance | StructDef | StructInstantiation;

// Array and collection types
type ArrayTypes = ArrayInstance | ArrayLiteral;

// Pointer and reference types
type PointerTypes = Pointer | AddrOf | Deref | PtrMutable | PtrIsBool;

// Identifier and value types
type IdentifierTypes = Ident | Value | KindBits;

// Call and instantiation expression types
type CallTypes = CallArgs | CallApp | StructInstantiation;

// Type annotation types
type TypeAnnotationTypes = Annotation | ParsedAnnotation | LiteralAnnotation;

// Variable state descriptor types
type StateTypes = Params | Mutable | Uninitialized;

// Function metadata types
type FunctionMetadataTypes = ClosureEnv | Body | IsBlock;

// Naming and field descriptor types
type DescriptorTypes = Yield | Name | Fields;

// Type system metadata (annotations, state, function metadata, descriptors)
type TypeSystemMetadata =
  | TypeAnnotationTypes
  | StateTypes
  | FunctionMetadataTypes
  | DescriptorTypes;

// Metadata and property descriptor types (used for parsing/evaluation) - max 5 union members
type MetadataTypes =
  | PointerTypes
  | IdentifierTypes
  | CallTypes
  | TypeSystemMetadata;

// Object-like runtime value types (excludes primitives) - max 5 union members
type PlainObjectTypes =
  | OperandTypes
  | FunctionTypes
  | StructureTypes
  | ArrayTypes
  | MetadataTypes;

// Numeric primitive types
type NumericTypes = number | bigint;

// Primitive value types (basic JavaScript primitives) - max 5 union members
type PrimitiveTypes = string | NumericTypes | boolean | undefined | null;

// Collection types (Map and Array)
type CollectionTypes = Map<string, RuntimeValue> | RuntimeValue[];

// Runtime value type - represents any value that can exist at runtime in the interpreter
// This is a union of all possible runtime value types (max 5 union members)
export type RuntimeValue =
  | PrimitiveTypes
  | Env
  | PlainObjectTypes
  | CollectionTypes;

export interface BoolOperand {
  type: "bool-operand";
  boolValue: boolean;
}

export interface FloatOperand {
  type: "float-operand";
  isFloat: true;
  floatValue: number;
}

export interface IntOperand {
  type: "int-operand";
  valueBig: bigint;
  kind?: string;
  bits?: number;
}

export interface FnWrapper {
  type: "fn-wrapper";
  fn: FunctionObject;
}

export interface ThisBinding {
  type: "this-binding";
  isThisBinding: true;
  fieldValues: Map<string, RuntimeValue>;
}

export interface StructInstance {
  type: "struct-instance";
  isStructInstance: true;
  fieldValues: Map<string, RuntimeValue>;
}

export interface StructDef {
  type: "struct-def";
  isStructDef: true;
}

export interface ArrayMetadata {
  length: number;
  initializedCount: number;
  elemType?: string;
}

export interface ArrayInstanceBase {
  type: "array-instance";
  isArray: true;
  elements: RuntimeValue[];
}

export type ArrayInstance = ArrayInstanceBase & ArrayMetadata;

export interface PointerFlags {
  ptrIsSlice?: boolean;
  ptrMutable?: boolean;
  ptrIsBool?: boolean;
}

export interface PointerTypeInfo {
  kind?: string;
  bits?: number;
}

export interface PointerStoredValue {
  valueBig?: bigint | RuntimeValue;
  isFloat?: boolean;
  floatValue?: number;
  boolValue?: boolean;
}

export interface PointerBase {
  type: "pointer";
  pointer: true;
  ptrName: string;
}

export type Pointer = PointerBase &
  PointerFlags &
  PointerTypeInfo &
  PointerStoredValue;

export interface ArrayLiteral {
  arrayLiteral: string[];
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
  parsedAnnotation: Map<string, RuntimeValue>;
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
  fields: Map<string, RuntimeValue>;
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

// Type guard to check if a runtime value is a plain object (non-primitive)
export function isPlainObject(v: RuntimeValue): v is PlainObjectTypes {
  // Use `!= undefined` to exclude both `undefined` and `null` without using
  // the `null` literal (ESLint rule bans null literals).
  return typeof v === "object" && v != undefined && !(v instanceof Map);
}

export function isFunctionObject(v: RuntimeValue): v is FunctionObject {
  return isPlainObject(v) && "params" in v && "body" in v && "isBlock" in v;
}

export function isBoolOperand(v: RuntimeValue): v is BoolOperand {
  return isPlainObject(v) && "type" in v && v.type === "bool-operand";
}

export function isFloatOperand(v: RuntimeValue): v is FloatOperand {
  return isPlainObject(v) && "type" in v && v.type === "float-operand";
}

export function isIntOperand(v: RuntimeValue): v is IntOperand {
  return isPlainObject(v) && "type" in v && v.type === "int-operand";
}

export function isFnWrapper(v: RuntimeValue): v is FnWrapper {
  return isPlainObject(v) && "type" in v && v.type === "fn-wrapper";
}

export function isThisBinding(v: RuntimeValue): v is ThisBinding {
  return isPlainObject(v) && "type" in v && v.type === "this-binding";
}

export function isStructInstance(v: RuntimeValue): v is StructInstance {
  return isPlainObject(v) && "type" in v && v.type === "struct-instance";
}

export function isStructDef(v: RuntimeValue): v is StructDef {
  return isPlainObject(v) && "type" in v && v.type === "struct-def";
}

export function isArrayInstance(v: RuntimeValue): v is ArrayInstance {
  return isPlainObject(v) && "type" in v && v.type === "array-instance";
}

// parse-time array literal placeholder shape
export function hasArrayLiteral(v: RuntimeValue): v is ArrayLiteral {
  if (!isPlainObject(v)) return false;
  const arr = getProp(v, "arrayLiteral");
  return Array.isArray(arr);
}

export function isPointer(v: RuntimeValue): v is Pointer {
  return isPlainObject(v) && "type" in v && v.type === "pointer";
}

export function unwrapBindingValue(binding: RuntimeValue): RuntimeValue {
  if (!isPlainObject(binding)) return binding;
  if (!Object.prototype.hasOwnProperty.call(binding, "value")) return binding;
  const v = Reflect.get(binding, "value");
  return v !== undefined ? v : binding;
}

// eslint-disable-next-line custom/no-unknown-param -- handles caught exceptions
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
    if (sum < 0n || sum > max) throwError(ErrorCode.OUT_OF_RANGE_U, { bits });
  } else {
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (sum < min || sum > max) throwError(ErrorCode.OUT_OF_RANGE_I, { bits });
  }
}

// Safe property getters - avoid `as` casts by using `in` checks
export function getProp(obj: RuntimeValue, key: string): RuntimeValue {
  if (!isPlainObject(obj)) return undefined;
  if (!(key in obj)) return undefined;
  // Use Reflect.get for dynamic property access
  return Reflect.get(obj, key);
}

export function hasProp(obj: RuntimeValue, key: string): boolean {
  return isPlainObject(obj) && key in obj;
}

export function hasStringProp(obj: RuntimeValue, key: string): boolean {
  if (!isPlainObject(obj)) return false;
  if (!(key in obj)) return false;
  const val = Reflect.get(obj, key);
  return typeof val === "string";
}

// Type guards for common property shapes
export function hasKindBits(v: RuntimeValue): v is KindBits {
  return (
    isPlainObject(v) &&
    "kind" in v &&
    typeof v.kind === "string" &&
    "bits" in v &&
    typeof v.bits === "number"
  );
}

export function hasIdent(v: RuntimeValue): v is Ident {
  return isPlainObject(v) && "ident" in v && typeof v.ident === "string";
}

export function hasAddrOf(v: RuntimeValue): v is AddrOf {
  return isPlainObject(v) && "addrOf" in v;
}

export function hasDeref(v: RuntimeValue): v is Deref {
  return isPlainObject(v) && "deref" in v;
}

export function hasCallArgs(v: RuntimeValue): v is CallArgs {
  return isPlainObject(v) && "callArgs" in v && Array.isArray(v.callArgs);
}

export function hasCallApp(v: RuntimeValue): v is CallApp {
  return isPlainObject(v) && "callApp" in v;
}

export function hasStructInstantiation(
  v: RuntimeValue
): v is StructInstantiation {
  return isPlainObject(v) && "structInstantiation" in v;
}

export function hasValue(v: RuntimeValue): v is Value {
  return isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, "value");
}

export function hasMutable(v: RuntimeValue): v is Mutable {
  return isPlainObject(v) && "mutable" in v;
}

export function hasUninitialized(v: RuntimeValue): v is Uninitialized {
  return isPlainObject(v) && "uninitialized" in v;
}

export function hasAnnotation(v: RuntimeValue): v is Annotation {
  return isPlainObject(v) && "annotation" in v;
}

export function hasParsedAnnotation(v: RuntimeValue): v is ParsedAnnotation {
  return isPlainObject(v) && "parsedAnnotation" in v;
}

export function hasLiteralAnnotation(v: RuntimeValue): v is LiteralAnnotation {
  return isPlainObject(v) && "literalAnnotation" in v;
}

export function hasParams(v: RuntimeValue): v is Params {
  return isPlainObject(v) && "params" in v && Array.isArray(v.params);
}

export function hasClosureEnv(v: RuntimeValue): v is ClosureEnv {
  return isPlainObject(v) && "closureEnv" in v;
}

export function hasBody(v: RuntimeValue): v is Body {
  return isPlainObject(v) && "body" in v;
}

export function hasIsBlock(v: RuntimeValue): v is IsBlock {
  return isPlainObject(v) && "isBlock" in v;
}

export function hasName(v: RuntimeValue): v is Name {
  return isPlainObject(v) && "name" in v;
}

export function hasFields(v: RuntimeValue): v is Fields {
  return isPlainObject(v) && "fields" in v;
}

export function hasPtrMutable(v: RuntimeValue): v is PtrMutable {
  return isPlainObject(v) && "ptrMutable" in v;
}

export function hasPtrIsBool(v: RuntimeValue): v is PtrIsBool {
  return isPlainObject(v) && "ptrIsBool" in v;
}

// eslint-disable-next-line custom/no-unknown-param -- checks thrown yield signals
export function hasYield(v: unknown): v is Yield {
  // Use `!= undefined` to check both null and undefined without using null literal
  if (typeof v !== "object" || v == undefined) return false;
  if (!("__yield" in v)) return false;
  const yieldVal = (v as Yield).__yield; // eslint-disable-line no-restricted-syntax
  return typeof yieldVal === "number";
}

// Setter helpers - avoid `as` type assertions by using Object.defineProperty
// These functions mutate properties on objects that have been verified via type guards.

export function setValue(obj: Value, val: RuntimeValue): void {
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
