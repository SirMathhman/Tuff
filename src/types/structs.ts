import { err, ok, type Result } from '../common/result';
import {
	isVariableName,
	findClosingBrace,
	type ExecutionContext,
	type ParsedBinding,
	type StructInstance,
	type VariableBinding,
} from '../common/types';
import { interpretInternal } from '../interpreter/evaluator';

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
	fieldValues: Map<string, number>;
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
	const seenFieldNames = new Set<string>();
	const declarations = trimmed.split(',');

	for (const decl of declarations) {
		const trimmedDecl = decl.trim();
		if (trimmedDecl.length === 0) {
			continue;
		}

		const fieldResult = parseStructFieldDecl(trimmedDecl);
		if (fieldResult.type === 'err') {
			return fieldResult;
		}

		const field = fieldResult.value;
		if (seenFieldNames.has(field.name)) {
			return err(`Struct field '${field.name}' is already defined`);
		}
		seenFieldNames.add(field.name);
		fields.push(field);
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
 * Validates that all fields defined in the struct are present.
 */
function validateAllFieldsInitialized(
	fieldValues: Map<string, number>,
	structDef: StructDefinition,
): Result<void> {
	for (const field of structDef.fields) {
		if (!fieldValues.has(field.name)) {
			return err(`Field '${field.name}' not initialized in ${structDef.name}`);
		}
	}
	return ok(undefined as void);
}

/**
 * Parses and validates a single field assignment during instantiation.
 */
function processFieldAssignment(
	decl: string,
	structDef: StructDefinition,
	seenFields: Set<string>,
	fieldValues: Map<string, number>,
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
	if (seenFields.has(fieldName)) {
		return err(`Duplicate field '${fieldName}' in instantiation`);
	}
	seenFields.add(fieldName);

	const fieldDef = structDef.fields.find((f): boolean => f.name === fieldName);
	if (fieldDef === undefined) {
		return err(`Struct field '${fieldName}' not found in ${structDef.name}`);
	}

	const valueResult = parseValue(trimmedDecl.substring(colonIndex + 1).trim());
	if (valueResult.type === 'err') {
		return valueResult;
	}

	fieldValues.set(fieldName, valueResult.value);
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
	const structDef = getStructDefinition(typeName);
	if (structDef === undefined) {
		return err(`Struct type '${typeName}' not defined`);
	}

	const closeIndex = findClosingBrace(trimmed.substring(braceIndex));
	if (closeIndex < 0) {
		return err('Struct instantiation missing closing brace');
	}

	const fieldValues: Map<string, number> = new Map();
	const seenFields = new Set<string>();
	const fieldDecls = trimmed.substring(braceIndex + 1, braceIndex + closeIndex).split(',');

	for (const decl of fieldDecls) {
		const res = processFieldAssignment(decl, structDef, seenFields, fieldValues, parseValue);
		if (res.type === 'err') {
			return res;
		}
	}

	const validation = validateAllFieldsInitialized(fieldValues, structDef);
	if (validation.type === 'err') {
		return validation;
	}

	return ok({ structType: typeName, fieldValues });
}

/**
 * Common logic for parsing a struct instantiation into a ParsedBinding.
 */
export function handleStructInstantiation(
	varName: string,
	isMutable: boolean,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> | undefined {
	if (!looksLikeStructInstantiation(valueStr)) {
		return undefined;
	}

	const instantRes = evaluateStructInstantiation(
		valueStr,
		(expr): Result<number> => interpretInternal(expr, context),
	);

	if (instantRes.type === 'err') {
		return instantRes;
	}

	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining,
		structValue: {
			structType: instantRes.value.structType,
			values: instantRes.value.fieldValues,
		},
	});
}
/**
 * Checks if a pattern looks like struct destructuring (e.g., "{ x, y }").
 */
export function looksLikeStructDestructuring(pattern: string): boolean {
	const trimmed = pattern.trim();
	return trimmed.startsWith('{') && trimmed.endsWith('}');
}

/**
 * Parses struct destructuring pattern to extract field names.
 */
export function parseDestructuringPattern(pattern: string): Result<string[]> {
	const trimmed = pattern.trim();
	if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
		return err('Invalid destructuring pattern');
	}

	const inner = trimmed.substring(1, trimmed.length - 1).trim();
	if (inner.length === 0) {
		return err('Destructuring pattern cannot be empty');
	}

	const fields = inner.split(',').map((f): string => f.trim());

	for (const field of fields) {
		if (!isVariableName(field)) {
			return err(`Invalid field name in destructuring: ${field}`);
		}
	}

	return ok(fields);
}

/**
 * Handles struct destructuring assignment.
 */
/**
 * Find struct binding by variable name from context.
 */
function findStructBinding(
	varName: string,
	context: ExecutionContext,
): VariableBinding | undefined {
	for (const binding of context.bindings) {
		if (binding.name === varName) {
			return binding;
		}
	}
	return undefined;
}

/**
 * Validate that destructuring target is a valid struct value.
 */
function getValidStructForDestructuring(
	varName: string,
	context: ExecutionContext,
): Result<StructInstance> {
	const structBinding = findStructBinding(varName, context);
	if (structBinding === undefined) {
		return err(`Variable '${varName}' is not initialized`);
	}

	if (structBinding.structValue === undefined) {
		return err('Cannot destructure non-struct value');
	}

	return ok(structBinding.structValue);
}

/**
 * Validate that all destructured fields exist in the struct definition.
 */
function validateDestructuredFieldsExist(
	fields: string[],
	structDef: StructDefinition,
	structValue: StructInstance,
): Result<void> {
	for (const field of fields) {
		const fieldExists = structDef.fields.some((f): boolean => f.name === field);
		if (!fieldExists) {
			return err(`Field '${field}' does not exist in struct ${structValue.structType}`);
		}

		const fieldValue = structValue.values.get(field);
		if (fieldValue === undefined) {
			return err(`Field '${field}' not found in struct instance`);
		}
	}
	return ok(undefined);
}

export function handleStructDestructuring(
	pattern: string,
	isMutable: boolean,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const fieldsResult = parseDestructuringPattern(pattern);
	if (fieldsResult.type === 'err') {
		return fieldsResult;
	}

	const fields = fieldsResult.value;

	// Find the struct binding to get its type and values
	const trimmedValueStr = valueStr.trim();
	if (!isVariableName(trimmedValueStr)) {
		return err('Destructuring value must be a variable name');
	}

	const structValueResult = getValidStructForDestructuring(trimmedValueStr, context);
	if (structValueResult.type === 'err') {
		return structValueResult;
	}

	const structValue = structValueResult.value;
	const structDef = getStructDefinition(structValue.structType);

	if (structDef === undefined) {
		return err(`Struct type ${structValue.structType} not found`);
	}

	// Validate all fields exist in struct
	const validationResult = validateDestructuredFieldsExist(fields, structDef, structValue);
	if (validationResult.type === 'err') {
		return validationResult;
	}

	// Return a special marker for destructuring
	return ok({
		name: '__destructuring__',
		value: undefined,
		isMutable,
		remaining,
		destructuredFields: {
			fields,
			structValue,
		},
	});
}
