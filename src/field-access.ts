import { err, ok, type Result } from './common/result';
import { type ExecutionContext, isBalancedBrackets, isVariableName } from './common/types';
import { evaluateStructInstantiation } from './structs';

interface InterpretFunction {
	(input: string, context: ExecutionContext): Result<number>;
}

interface FieldAccessExpression {
	instanceExpr: string;
	fieldName: string;
}

function hasFieldAccess(literal: string): boolean {
	const trimmed = literal.trim();
	const dotIndex = trimmed.lastIndexOf('.');
	if (dotIndex <= 0) {
		return false;
	}

	const beforeDot = trimmed.substring(0, dotIndex);
	if (beforeDot.includes('}')) {
		return true;
	}

	return isVariableName(beforeDot.trim());
}

function extractFieldAccess(literal: string): FieldAccessExpression | undefined {
	const trimmed = literal.trim();
	const dotIndex = trimmed.lastIndexOf('.');
	if (dotIndex <= 0) {
		return undefined;
	}

	const instanceExpr = trimmed.substring(0, dotIndex);
	const fieldName = trimmed.substring(dotIndex + 1).trim();

	if (fieldName.length === 0 || !isVariableName(fieldName)) {
		return undefined;
	}

	return { instanceExpr, fieldName };
}

function lookupStructVariableField(
	varName: string,
	fieldName: string,
	context: ExecutionContext,
): Result<number> | undefined {
	for (const binding of context.bindings) {
		if (binding.name !== varName || binding.structValue === undefined) {
			continue;
		}
		const fieldValue = binding.structValue.values.get(fieldName);
		if (typeof fieldValue === 'number') {
			return ok(fieldValue);
		}
		return err(`Field '${fieldName}' not found in struct '${binding.structValue.structType}'`);
	}
	return undefined;
}

function lookupThisField(fieldName: string, context: ExecutionContext): Result<number> | undefined {
	for (const binding of context.bindings) {
		if (binding.name !== fieldName) {
			continue;
		}
		if (binding.value === undefined) {
			return err(`Variable '${fieldName}' is not initialized`);
		}
		return ok(binding.value);
	}
	return undefined;
}

function evaluateInlineStructFieldAccess(
	instanceExpr: string,
	fieldName: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> {
	const instanceResult = evaluateStructInstantiation(
		instanceExpr,
		(expr): Result<number> => interpretInternal(expr, context),
	);

	if (instanceResult.type === 'err') {
		return instanceResult;
	}

	const fieldValue = instanceResult.value.fieldValues.get(fieldName);
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (fieldValue === undefined) {
		return err(`Field '${fieldName}' not found in struct '${instanceResult.value.structType}'`);
	}

	return ok(fieldValue);
}

function lookupThisFieldOrError(fieldName: string, context: ExecutionContext): Result<number> {
	const lookupResult = lookupThisField(fieldName, context);
	if (lookupResult !== undefined) {
		return lookupResult;
	}
	return err(`Variable '${fieldName}' not found`);
}

function tryLookupVariableFieldAccess(
	varName: string,
	fieldName: string,
	context: ExecutionContext,
): Result<number> | undefined {
	const binding = context.bindings.find((b): boolean => b.name === varName);
	if (binding?.thisValue === true) {
		return lookupThisFieldOrError(fieldName, context);
	}

	return lookupStructVariableField(varName, fieldName, context);
}

export function tryParseFieldAccess(
	literal: string,
	context: ExecutionContext,
	interpretInternal: InterpretFunction,
): Result<number> | undefined {
	if (!hasFieldAccess(literal)) {
		return undefined;
	}

	const fieldAccessResult = extractFieldAccess(literal);
	if (fieldAccessResult === undefined) {
		return undefined;
	}

	const { instanceExpr, fieldName } = fieldAccessResult;
	const trimmedExpr = instanceExpr.trim();

	if (trimmedExpr === 'this') {
		return lookupThisFieldOrError(fieldName, context);
	}

	if (isVariableName(trimmedExpr)) {
		const lookupResult = tryLookupVariableFieldAccess(trimmedExpr, fieldName, context);
		if (lookupResult !== undefined) {
			return lookupResult;
		}
		return undefined;
	}

	if (trimmedExpr.startsWith('{') && !isBalancedBrackets(trimmedExpr)) {
		return err('Unbalanced brackets');
	}

	return evaluateInlineStructFieldAccess(instanceExpr, fieldName, context, interpretInternal);
}
