import { err, ok, type Result } from './common/result';
import { processTopLevelStatements } from './interpreter/statements';
import { interpretInternal } from './interpreter/evaluator';
import {
	findClosingBrace,
	findSemicolonOutsideBrackets,
	type VariableBinding,
	type ExecutionContext,
} from './common/types';
import { parseFunctionDefinition } from './interpreter/functions';
import { ReturnSignal } from './parser/function-call-utils';

function stripAfterIndex(s: string, idx: number): string {
	let rem = s.substring(idx + 1).trim();
	if (rem.startsWith(';')) {
		rem = rem.substring(1).trim();
	}
	return rem;
}

function handleBraceSegment(remaining: string): string | undefined {
	const ci = findClosingBrace(remaining);
	if (ci >= 0 && isOnlyStructsOrBlocks(remaining.substring(1, ci))) {
		return stripAfterIndex(remaining, ci);
	}
	return undefined;
}

function handleStructSegment(remaining: string): string | undefined {
	const braceIdx = remaining.indexOf('{');
	if (braceIdx < 0) {
		return undefined;
	}
	const closeRel = findClosingBrace(remaining.substring(braceIdx));
	if (closeRel < 0) {
		return undefined;
	}
	return stripAfterIndex(remaining, braceIdx + closeRel);
}

function handleFunctionSegment(remaining: string): string | undefined {
	const parsed = parseFunctionDefinition(remaining);
	if (parsed.type === 'err') {
		return undefined;
	}
	return parsed.value.remaining;
}

function isOnlyStructsOrBlocks(inputStr: string): boolean {
	let remaining = inputStr.trim();
	while (remaining.length > 0) {
		let next: string | undefined;
		if (remaining.startsWith('{')) {
			next = handleBraceSegment(remaining);
		} else if (remaining.startsWith('struct ')) {
			next = handleStructSegment(remaining);
		} else if (remaining.startsWith('fn ')) {
			next = handleFunctionSegment(remaining);
		} else {
			return false;
		}

		if (next === undefined) {
			return false;
		}

		remaining = next;
	}
	return true;
}

function handleNoRemainingExpression(input: string, bindings: VariableBinding[]): Result<number> {
	// If top-level only contained struct declarations (or braced blocks containing
	// only struct declarations) and there are no variable bindings, accept as 0.
	if (bindings.length === 0 && isOnlyStructsOrBlocks(input.trim())) {
		return ok(0);
	}

	return err('expression required after variable declarations');
}

function trimLeadingSemicolons(input: string): string {
	let remaining = input.trim();
	while (remaining.startsWith(';')) {
		remaining = remaining.substring(1).trim();
	}
	return remaining;
}

function interpretExpressionStatements(
	remaining: string,
	context: ExecutionContext,
): Result<number> {
	let rest = remaining.trim();
	let lastValue = 0;
	let hasValue = false;

	while (rest.length > 0) {
		const semiIndex = findSemicolonOutsideBrackets(rest);
		if (semiIndex < 0) {
			return interpretInternal(rest, context);
		}

		const expr = rest.substring(0, semiIndex).trim();
		rest = trimLeadingSemicolons(rest.substring(semiIndex + 1));
		if (expr.length === 0) {
			continue;
		}

		const exprResult = interpretInternal(expr, context);
		if (exprResult.type === 'err') {
			return exprResult;
		}
		lastValue = exprResult.value;
		hasValue = true;
	}

	if (!hasValue) {
		return err('expression required');
	}

	return ok(lastValue);
}

/**
 * Interprets a mathematical expression with typed numeric literals and variable bindings.
 * Supports arithmetic operations, type annotations, variable declarations, and assignments.
 *
 * @param input - The expression string to interpret
 * @param context - Optional execution context with stdin state
 * @returns Result containing the evaluated number or an error message
 */
export function interpret(input: string, context?: ExecutionContext): Result<number> {
	try {
		const initialContext: ExecutionContext = context ?? { bindings: [] };
		const result = processTopLevelStatements(input, initialContext);
		if (result.type === 'err') {
			return result;
		}

		const trimmedRemaining = result.value.remaining.trim();
		if (trimmedRemaining.startsWith('__RETURN__:')) {
			return err('Return statement not allowed outside of function');
		}
		if (trimmedRemaining.length === 0) {
			return handleNoRemainingExpression(input, result.value.context.bindings);
		}

		return interpretExpressionStatements(trimmedRemaining, result.value.context);
	} catch (error) {
		if (error instanceof ReturnSignal) {
			return err('Return statement not allowed outside of function');
		}
		throw error;
	}
}
