import { err, ok, type Result } from './result';
import { processTopLevelStatements } from './statements';
import { interpretInternal } from './evaluator';

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
		const hasOnlyStructDeclarations =
			trimmedInput.startsWith('struct ') && result.value.context.bindings.length === 0;
		if (hasOnlyStructDeclarations) {
			return ok(0);
		}
		return err('expression required after variable declarations');
	}

	return interpretInternal(trimmedRemaining, result.value.context);
}
