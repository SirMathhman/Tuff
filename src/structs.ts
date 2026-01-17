import { err, ok, type Result } from './result';
import { isVariableName, findClosingBrace } from './types';

/**
 * Represents a struct field definition.
 */
export interface StructField {
	name: string;
	type: string;
}

/**
 * Represents a struct type definition.
 */
export interface StructDefinition {
	name: string;
	fields: StructField[];
}

/**
 * Represents the result of evaluating a struct instantiation.
 */
export interface StructInstantiationResult {
	structType: string;
	fieldValues: Record<string, number>;
}

/**
 * Global registry of struct definitions.
 */
const structRegistry: Map<string, StructDefinition> = new Map();

/**
 * Registers a struct definition globally.
 */
export function registerStructDefinition(def: StructDefinition): void {
	structRegistry.set(def.name, def);
}

/**
 * Gets a struct definition from registry.
 */
export function getStructDefinition(name: string): StructDefinition | undefined {
	return structRegistry.get(name);
}

/**
 * Checks if a type name is a registered struct type.
 */
export function isStructType(typeName: string): boolean {
	return structRegistry.has(typeName);
}

/**
 * Clears struct registry (for testing).
 */
export function clearStructRegistry(): void {
	structRegistry.clear();
}

/**
 * Checks if input starts with struct definition.
 */
export function isStructDefinition(input: string): boolean {
	const trimmed = input.trim();
	return trimmed.startsWith('struct ');
}

/**
 * Extracts struct name from definition.
 */
function extractStructName(afterStruct: string): Result<string> {
	const trimmed = afterStruct.trim();
	let nameEnd = 0;

	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
		if (char === ' ' || char === '{') {
			nameEnd = i;
			break;
		}
		nameEnd = i + 1;
	}

	const structName = trimmed.substring(0, nameEnd).trim();
	if (!isVariableName(structName)) {
		return err(`Invalid struct name: ${structName}`);
	}

	return ok(structName);
}

/**
 * Checks if closing brace found at depth 0.
 */
function checkClosingBrace(char: string, depth: number): number {
	if (char === '{') {
		return depth + 1;
	}
	if (char === '}') {
		return depth - 1;
	}
	return depth;
}

/**
 * Finds the closing brace of struct definition body.
 */
function findStructBodyEnd(input: string): number {
	let depth = 0;
	for (let i = 0; i < input.length; i++) {
		depth = checkClosingBrace(input[i], depth);
		if (depth === 0 && input[i] === '}') {
			return i;
		}
	}
	return -1;
}

/**
 * Parses a single struct field from a declaration string.
 */
function parseStructFieldDecl(trimmedDecl: string): Result<StructField> {
	const colonIndex = trimmedDecl.indexOf(':');
	if (colonIndex < 0) {
		return err(`Invalid struct field: ${trimmedDecl}`);
	}

	const fieldName = trimmedDecl.substring(0, colonIndex).trim();
	const fieldType = trimmedDecl.substring(colonIndex + 1).trim();

	if (!isVariableName(fieldName)) {
		return err(`Invalid field name: ${fieldName}`);
	}

	if (fieldType.length === 0) {
		return err(`Field '${fieldName}' missing type`);
	}

	return ok({ name: fieldName, type: fieldType });
}

/**
 * Parses a single field declaration and adds to fields list.
 */
function addParsedField(trimmedDecl: string, fields: StructField[]): Result<void> {
	if (trimmedDecl.length === 0) {
		return ok(undefined as void);
	}

	const fieldResult = parseStructFieldDecl(trimmedDecl);
	if (fieldResult.type === 'err') {
		return fieldResult;
	}

	fields.push(fieldResult.value);
	return ok(undefined as void);
}

/**
 * Parses struct body to extract fields.
 */
function parseStructBody(bodyStr: string): Result<StructField[]> {
	const trimmed = bodyStr.trim();
	if (trimmed.length === 0) {
		// Allow empty struct bodies (no fields)
		return ok([]);
	}

	const fields: StructField[] = [];
	const declarations = trimmed.split(',');

	for (const decl of declarations) {
		const fieldAddResult = addParsedField(decl.trim(), fields);
		if (fieldAddResult.type === 'err') {
			return fieldAddResult;
		}
	}

	return ok(fields);
}

/**
 * Parses struct definition statement.
 */
export function parseStructDefinition(input: string): Result<StructDefinition> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('struct ')) {
		return err('Not a struct definition');
	}

	const afterStruct = trimmed.substring(7);
	const nameResult = extractStructName(afterStruct);
	if (nameResult.type === 'err') {
		return nameResult;
	}

	const structName = nameResult.value;
	const bracesStart = afterStruct.indexOf('{');
	if (bracesStart < 0) {
		return err('Struct missing opening brace');
	}

	const bodyEnd = findStructBodyEnd(afterStruct.substring(bracesStart));
	if (bodyEnd < 0) {
		return err('Struct missing closing brace');
	}

	const bodyStr = afterStruct.substring(bracesStart + 1, bracesStart + bodyEnd);
	const fieldsResult = parseStructBody(bodyStr);
	if (fieldsResult.type === 'err') {
		return fieldsResult;
	}

	return ok({ name: structName, fields: fieldsResult.value });
}
/**
 * Checks if an expression looks like a struct instantiation.
 */
export function looksLikeStructInstantiation(expr: string): boolean {
	const trimmed = expr.trim();
	const braceIndex = trimmed.indexOf('{');
	if (braceIndex <= 0) {
		return false;
	}

	const typeName = trimmed.substring(0, braceIndex).trim();
	return isVariableName(typeName) && isStructType(typeName);
}

/**
 * Parses a single field in struct instantiation.
 */
function parseStructInstantiationField(
	decl: string,
	structDef: StructDefinition,
	fieldValues: Record<string, number>,
	parseValue: (expr: string) => Result<number>,
): Result<void> {
	const trimmedDecl = decl.trim();
	if (trimmedDecl.length === 0) {
		return ok(undefined as void);
	}

	const colonIndex = trimmedDecl.indexOf(':');
	if (colonIndex < 0) {
		return err(`Invalid struct field assignment: ${trimmedDecl}`);
	}

	const fieldName = trimmedDecl.substring(0, colonIndex).trim();
	const fieldValueStr = trimmedDecl.substring(colonIndex + 1).trim();

	const fieldDef = structDef.fields.find((f): boolean => f.name === fieldName);
	if (fieldDef === undefined) {
		return err(`Struct field '${fieldName}' not found in ${structDef.name}`);
	}

	const valueResult = parseValue(fieldValueStr);
	if (valueResult.type === 'err') {
		return valueResult;
	}

	fieldValues[fieldName] = valueResult.value;
	return ok(undefined as void);
}

/**
 * Evaluates a struct instantiation expression with a value parser.
 */
export function evaluateStructInstantiation(
	expr: string,
	parseValue: (expr: string) => Result<number>,
): Result<StructInstantiationResult> {
	const trimmed = expr.trim();
	const braceIndex = trimmed.indexOf('{');
	if (braceIndex <= 0) {
		return err('Struct instantiation missing opening brace');
	}

	const typeName = trimmed.substring(0, braceIndex).trim();
	if (!isVariableName(typeName)) {
		return err(`Invalid struct type name: ${typeName}`);
	}

	const structDef = getStructDefinition(typeName);
	if (structDef === undefined) {
		return err(`Struct type '${typeName}' not defined`);
	}

	const closeIndex = findClosingBrace(trimmed.substring(braceIndex));
	if (closeIndex < 0) {
		return err('Struct instantiation missing closing brace');
	}

	const bodyStr = trimmed.substring(braceIndex + 1, braceIndex + closeIndex);
	const fieldValues: Record<string, number> = {};

	const fieldDecls = bodyStr.split(',');
	for (const decl of fieldDecls) {
		const fieldResult = parseStructInstantiationField(decl, structDef, fieldValues, parseValue);
		if (fieldResult.type === 'err') {
			return fieldResult;
		}
	}

	return ok({ structType: typeName, fieldValues });
}
