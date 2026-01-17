import { type ExecutionContext, type VariableBinding, isVariableName } from './types';
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
	if (!trimmed.endsWith(')')) {
		return undefined;
	}

	let depth = 0;
	let openIndex = -1;
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
		if (depth !== 0) {
			continue;
		}
		openIndex = i;
		break;
	}

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
): ExecutionContext {
	const paramNames = new Set<string>();
	const paramBindings: VariableBinding[] = def.parameters.map((p, idx): VariableBinding => {
		paramNames.add(p.name);
		return { name: p.name, value: argValues[idx], isMutable: false };
	});

	const outerBindings = outerContext.bindings.filter((b): boolean => !paramNames.has(b.name));
	return { bindings: [...paramBindings, ...outerBindings] };
}
