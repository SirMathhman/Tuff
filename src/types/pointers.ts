import { err, ok, type Result } from '../common/result';
import { type ExecutionContext, type ParsedBinding, type PointerValue } from '../common/types';

interface PointerTypeInfo {
	pointedToType: string;
	isMutable: boolean;
}

interface PointerAssignmentInfo {
	pointerVarName: string;
	newValue: number;
	remaining: string;
}

/**
 * Checks if a type annotation is a pointer type: *Type or *mut Type
 */
export function isPointerType(typeAnnotation: string): boolean {
	const trimmed = typeAnnotation.trim();
	return trimmed.startsWith('*');
}

/**
 * Parses a pointer type annotation and extracts the pointed-to type and mutability.
 * Returns { pointedToType, isMutable }
 */
export function parsePointerType(typeAnnotation: string): PointerTypeInfo | undefined {
	const trimmed = typeAnnotation.trim();
	if (!trimmed.startsWith('*')) {
		return undefined;
	}

	const afterStar = trimmed.substring(1).trim();
	if (afterStar.startsWith('mut ')) {
		return {
			pointedToType: afterStar.substring(4).trim(),
			isMutable: true,
		};
	}

	return {
		pointedToType: afterStar,
		isMutable: false,
	};
}

/**
 * Checks if input looks like a reference expression: &varName
 */
export function isReferenceExpression(input: string): boolean {
	const trimmed = input.trim();
	return trimmed.startsWith('&') && trimmed.length > 1;
}

/**
 * Parses a reference expression: &varName
 * Returns the variable name being referenced
 */
export function parseReferenceExpression(input: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed.startsWith('&')) {
		return undefined;
	}

	const varName = trimmed.substring(1).trim();
	if (varName.length > 0) {
		return varName;
	}
	return undefined;
}

/**
 * Checks if input looks like a dereference expression: *varName
 */
export function isDereferenceExpression(input: string): boolean {
	const trimmed = input.trim();
	return trimmed.startsWith('*') && trimmed.length > 1 && !trimmed.startsWith('*mut ');
}

/**
 * Parses a dereference expression: *varName
 * Returns the pointer variable name being dereferenced
 */
export function parseDereferenceExpression(input: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed.startsWith('*')) {
		return undefined;
	}

	const afterStar = trimmed.substring(1).trim();
	if (afterStar.length > 0) {
		return afterStar;
	}
	return undefined;
}

/**
 * Handles pointer type variable binding: let y : *I32 = &x;
 */
// eslint-disable-next-line max-lines-per-function
export function parsePointerTypeBinding(
	varName: string,
	isMutable: boolean,
	typeAnnotation: string,
	valueStr: string,
	remaining: string,
	context: ExecutionContext,
): Result<ParsedBinding> {
	const pointerType = parsePointerType(typeAnnotation);
	if (pointerType === undefined) {
		return err(`Invalid pointer type: ${typeAnnotation}`);
	}

	const referencedVarName = parseReferenceExpression(valueStr);
	if (referencedVarName === undefined) {
		return err('Expected reference expression (&varName) for pointer initialization');
	}

	const referencedBinding = context.bindings.find((b): boolean => b.name === referencedVarName);
	if (referencedBinding === undefined) {
		return err(`Variable '${referencedVarName}' not found`);
	}

	const pointerIsMutable = pointerType.isMutable;
	const targetIsMutable = referencedBinding.isMutable;
	const mutabilityMatch =
		(!pointerIsMutable && !targetIsMutable) || (pointerIsMutable && targetIsMutable);

	if (!mutabilityMatch) {
		let pointerMutStr = 'mutable';
		if (!pointerIsMutable) {
			pointerMutStr = 'immutable';
		}
		let targetMutStr = 'mutable';
		if (!targetIsMutable) {
			targetMutStr = 'immutable';
		}
		return err(`Cannot take ${pointerMutStr} pointer to ${targetMutStr} variable`);
	}

	const pointerValue: PointerValue = {
		pointsToName: referencedVarName,
		isMutable: pointerIsMutable,
	};
	return ok({
		name: varName,
		value: undefined,
		isMutable,
		remaining,
		pointerValue,
	});
}

/**
 * Resolves a pointer to get the value it points to
 */
export function dereferencePointer(
	pointerValue: PointerValue,
	context: ExecutionContext,
): Result<number> {
	const binding = context.bindings.find((b): boolean => b.name === pointerValue.pointsToName);
	if (binding === undefined) {
		return err(`Pointed-to variable '${pointerValue.pointsToName}' not found`);
	}

	if (binding.value === undefined) {
		return err('Cannot dereference pointer to uninitialized variable');
	}

	return ok(binding.value);
}

/**
 * Handles pointer dereference assignment: *y = 100;
 * Returns { pointerVarName, newValue, remaining }
 */
export function parsePointerAssignment(
	input: string,
	context: ExecutionContext,
): PointerAssignmentInfo | undefined {
	const trimmed = input.trim();
	if (!trimmed.startsWith('*')) {
		return undefined;
	}

	const afterStar = trimmed.substring(1).trim();
	const equalIndex = afterStar.indexOf('=');
	if (equalIndex < 0) {
		return undefined;
	}

	const pointerVarName = afterStar.substring(0, equalIndex).trim();
	const afterEqual = afterStar.substring(equalIndex + 1).trim();

	if (!pointerVarName) {
		return undefined;
	}

	const pointerBinding = context.bindings.find((b): boolean => b.name === pointerVarName);
	if (!pointerBinding?.pointerValue) {
		return undefined;
	}

	const semiIndex = afterEqual.indexOf(';');
	let valueStr: string;
	let remaining: string;
	if (semiIndex >= 0) {
		valueStr = afterEqual.substring(0, semiIndex).trim();
		remaining = afterEqual.substring(semiIndex + 1).trim();
	} else {
		valueStr = afterEqual.trim();
		remaining = '';
	}

	const valueNum = Number.parseInt(valueStr, 10);
	if (Number.isNaN(valueNum)) {
		return undefined;
	}

	return {
		pointerVarName,
		newValue: valueNum,
		remaining,
	};
}
