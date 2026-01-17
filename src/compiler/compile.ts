import { err, ok, type Result } from '../common/result';
import { compileBracedExpressionsToIife, stripLetTypeAnnotations } from './block-expressions';
import {
	validateConstantExpressions,
	validateMutability,
	validateNumericLiterals,
} from './validation';
import { replaceBooleans, replaceYieldWithReturn, stripTypeSuffixes } from './transforms/basic';
import { replaceForLoops } from './transforms/for-loops';
import { replaceIfExpressions } from './transforms/if-expressions';
import { replaceMatchExpressions } from './transforms/match-expressions';
import { replaceReadCalls, wrapCompiledCode } from './transforms/read-and-wrap';

// NOTE: This file intentionally stays small to satisfy lint constraints.
// The compilation pipeline is composed from:
// - validation: src/compiler/validation.ts
// - transforms: src/compiler/transforms/*

/**
 * Compiles Tuff source code to JavaScript.
 *
 * @param input - The Tuff source code to compile
 * @returns A Result containing the compiled JavaScript code or an error
 */
export function compile(input: string): Result<string> {
	// Validate mutability constraints
	const mutValidation = validateMutability(input);
	if (mutValidation.type === 'err') {
		return err(mutValidation.error);
	}

	// Validate numeric literals with type suffixes
	const numericValidation = validateNumericLiterals(input);
	if (numericValidation.type === 'err') {
		return err(numericValidation.error);
	}

	// Validate constant arithmetic expressions (constant folding)
	const constantValidation = validateConstantExpressions(input);
	if (constantValidation.type === 'err') {
		return err(constantValidation.error);
	}

	// Treat top-level code as a block by wrapping in braces
	const wrappedInput = `{ ${input} }`;
	let jsCode = compileBracedExpressionsToIife(stripLetTypeAnnotations(wrappedInput));

	// Replace match expressions (before if-expression conversion)
	jsCode = replaceMatchExpressions(jsCode);

	// Replace yield with return (before if-expression conversion)
	jsCode = replaceYieldWithReturn(jsCode);

	// Replace for loops (before if-expression conversion)
	jsCode = replaceForLoops(jsCode);

	// Replace if expressions with ternary operators
	jsCode = replaceIfExpressions(jsCode);

	// Replace boolean literals (true -> 1, false -> 0)
	jsCode = replaceBooleans(jsCode);

	// Strip type suffixes from numeric literals (100U8 -> 100)
	jsCode = stripTypeSuffixes(jsCode);

	// Replace read<T>() calls with JavaScript code to read from stdin
	jsCode = replaceReadCalls(jsCode);

	// Wrap to capture the result value and output it for the runner to parse
	const usesStdin = input.includes('read<');
	jsCode = wrapCompiledCode(jsCode, usesStdin);

	return ok(jsCode);
}
