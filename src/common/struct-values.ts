import { type ExecutionContext, type FunctionReference, type StructInstance } from './types';

export const LAST_STRUCT_INSTANCE_BINDING_NAME = '__LAST_STRUCT_INSTANCE__';

export function setLastStructInstance(context: ExecutionContext, instance: StructInstance): void {
	const existing = context.bindings.find(
		(b): boolean => b.name === LAST_STRUCT_INSTANCE_BINDING_NAME,
	);
	if (existing !== undefined) {
		existing.structValue = instance;
		return;
	}

	context.bindings.push({
		name: LAST_STRUCT_INSTANCE_BINDING_NAME,
		value: 0,
		isMutable: false,
		structValue: instance,
	});
}

export function getLastStructInstance(context: ExecutionContext): StructInstance | undefined {
	const binding = context.bindings.find(
		(b): boolean => b.name === LAST_STRUCT_INSTANCE_BINDING_NAME,
	);
	return binding?.structValue;
}

export function clearLastStructInstance(context: ExecutionContext): void {
	const index = context.bindings.findIndex(
		(b): boolean => b.name === LAST_STRUCT_INSTANCE_BINDING_NAME,
	);
	if (index < 0) {
		return;
	}
	context.bindings.splice(index, 1);
}

export function captureScopeAsStructInstance(context: ExecutionContext): StructInstance {
	const values = new Map<string, number>();
	const functionReferences = new Map<string, FunctionReference>();

	for (const binding of context.bindings) {
		if (binding.name.startsWith('__')) {
			continue;
		}
		if (binding.value !== undefined) {
			values.set(binding.name, binding.value);
		}
		if (binding.functionReferenceValue !== undefined) {
			functionReferences.set(binding.name, binding.functionReferenceValue);
		}
	}

	return {
		structType: 'Scope',
		values,
		functionReferences,
	};
}
