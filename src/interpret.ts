import { err, ok, type Result } from './result';
import { processTopLevelStatements } from './statements';
import { interpretInternal } from './evaluator';
import { findClosingBrace } from './types';

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

function isOnlyStructsOrBlocks(inputStr: string): boolean {
	let remaining = inputStr.trim();
	while (remaining.length > 0) {
		let next: string | undefined;
		if (remaining.startsWith('{')) {
			next = handleBraceSegment(remaining);
		} else if (remaining.startsWith('struct ')) {
			next = handleStructSegment(remaining);
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

/**
 * Interprets a mathematical expression with typed numeric literals and variable bindings.
 * Supports arithmetic operations, type annotations, variable declarations, and assignments.
 * @param input - The expression string to interpret
 * @returns Result containing the evaluated number or an error message
 */
export function interpret(input: string): Result<number> {
	const result = processTopLevelStatements(input, { bindings: [] });
	if (result.type === 'err') {
		return result;
	}

	const trimmedRemaining = result.value.remaining.trim();
	if (trimmedRemaining.length === 0) {
		const trimmedInput = input.trim();

		// If top-level only contained struct declarations (or braced blocks containing
		// only struct declarations) and there are no variable bindings, accept as 0.
		if (result.value.context.bindings.length === 0 && isOnlyStructsOrBlocks(trimmedInput)) {
			return ok(0);
		}

		return err('expression required after variable declarations');
	}

	return interpretInternal(trimmedRemaining, result.value.context);
}
