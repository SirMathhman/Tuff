import { type ExecutionContext, type FunctionReference, type VariableBinding } from './types';

export const LAST_FUNCTION_REFERENCE_BINDING_NAME = '__LAST_FUNCTION_REFERENCE__';

function cloneWithCapturedBindings(
	ref: FunctionReference,
	fallbackCapturedBindings: VariableBinding[],
): FunctionReference {
	if (ref.capturedBindings !== undefined) {
		return ref;
	}
	return { functionName: ref.functionName, capturedBindings: fallbackCapturedBindings };
}

export function setLastFunctionReference(context: ExecutionContext, ref: FunctionReference): void {
	const existing = context.bindings.find(
		(b): boolean => b.name === LAST_FUNCTION_REFERENCE_BINDING_NAME,
	);
	if (existing !== undefined) {
		existing.functionReferenceValue = ref;
		return;
	}

	context.bindings.push({
		name: LAST_FUNCTION_REFERENCE_BINDING_NAME,
		value: 0,
		isMutable: false,
		functionReferenceValue: ref,
	});
}

export function getLastFunctionReference(context: ExecutionContext): FunctionReference | undefined {
	const binding = context.bindings.find(
		(b): boolean => b.name === LAST_FUNCTION_REFERENCE_BINDING_NAME,
	);
	return binding?.functionReferenceValue;
}

export function clearLastFunctionReference(context: ExecutionContext): void {
	const index = context.bindings.findIndex(
		(b): boolean => b.name === LAST_FUNCTION_REFERENCE_BINDING_NAME,
	);
	if (index < 0) {
		return;
	}
	context.bindings.splice(index, 1);
}

export function captureFunctionReferenceFromBinding(
	binding: VariableBinding,
	context: ExecutionContext,
): FunctionReference | undefined {
	if (binding.functionReferenceValue === undefined) {
		return undefined;
	}

	return cloneWithCapturedBindings(binding.functionReferenceValue, context.bindings);
}

export function captureFunctionReferenceByName(
	functionName: string,
	context: ExecutionContext,
): FunctionReference {
	return { functionName, capturedBindings: context.bindings };
}
