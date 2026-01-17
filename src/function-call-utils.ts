import { type ExecutionContext, type VariableBinding, isVariableName } from './common/types';
import { type FunctionDefinition } from './functions';

export class ReturnSignal extends Error {
	constructor(readonly value: number) {
		super('Function returned');
		Object.setPrototypeOf(this, ReturnSignal.prototype);
	}
}

export interface FunctionCallExpression {
	functionName: string;
	args: string[];
}

/**
 * Finds the matching opening parenthesis for the final closing parenthesis of a call.
 * Returns -1 if the input is not a well-formed call suffix.
 */
export function findCallOpenParenIndex(trimmed: string): number {
	if (!trimmed.endsWith(')')) {
		return -1;
	}

	let depth = 0;
	for (let i = trimmed.length - 1; i >= 0; i--) {
		const char = trimmed[i];
		if (char === ')') {
			depth++;
			continue;
		}
		if (char !== '(') {
			continue;
		}

		depth--;
		if (depth === 0) {
			return i;
		}
	}

	return -1;
}

export function splitArguments(argsStr: string): string[] {
	const args: string[] = [];
	let current = '';
	let parenDepth = 0;
	let braceDepth = 0;

	for (let i = 0; i < argsStr.length; i++) {
		const char = argsStr[i];
		if (char === '(') {
			parenDepth++;
		} else if (char === ')') {
			parenDepth--;
		} else if (char === '{') {
			braceDepth++;
		} else if (char === '}') {
			braceDepth--;
		}

		if (char === ',' && parenDepth === 0 && braceDepth === 0) {
			args.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	const last = current.trim();
	if (last.length > 0) {
		args.push(last);
	}

	return args;
}

export function extractFunctionCallExpression(literal: string): FunctionCallExpression | undefined {
	const trimmed = literal.trim();
	const openIndex = findCallOpenParenIndex(trimmed);
	if (openIndex <= 0) {
		return undefined;
	}

	const functionName = trimmed.substring(0, openIndex).trim();
	if (!isVariableName(functionName)) {
		return undefined;
	}

	const argsStr = trimmed.substring(openIndex + 1, trimmed.length - 1);
	const args = splitArguments(argsStr);
	return { functionName, args };
}

export function createCallContext(
	def: FunctionDefinition,
	argValues: number[],
	outerContext: ExecutionContext,
	capturedBindings?: VariableBinding[],
): ExecutionContext {
	const paramNames = new Set<string>();
	const paramBindings: VariableBinding[] = def.parameters.map((p, idx): VariableBinding => {
		paramNames.add(p.name);
		return { name: p.name, value: argValues[idx], isMutable: false };
	});

	const captured = capturedBindings ?? [];
	const capturedNames = new Set<string>();
	for (const b of captured) {
		capturedNames.add(b.name);
	}

	const outerBindings = outerContext.bindings.filter((b): boolean => {
		if (paramNames.has(b.name)) {
			return false;
		}
		if (capturedNames.has(b.name)) {
			return false;
		}
		return true;
	});

	return { bindings: [...paramBindings, ...captured, ...outerBindings] };
}
