import { err, ok, type Result } from '../common/result';
import { compileBracedExpressionsToIife, stripLetTypeAnnotations } from './block-expressions';
import {
	validateConstantExpressions,
	validateMutability,
	validateNumericLiterals,
} from './validation';
import { replaceBooleans, replaceYieldWithReturn, stripTypeSuffixes } from './transforms/basic';
import { replaceFunctionDefinitions } from './transforms/functions';
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
	const mutValidation = validateMutability(input);
	if (mutValidation.type === 'err') {
		return err(mutValidation.error);
	}

	const numericValidation = validateNumericLiterals(input);
	if (numericValidation.type === 'err') {
		return err(numericValidation.error);
	}

	const constantValidation = validateConstantExpressions(input);
	if (constantValidation.type === 'err') {
		return err(constantValidation.error);
	}

	const wrappedInput = `{ ${input} }`;
	let jsCode = compileBracedExpressionsToIife(stripLetTypeAnnotations(wrappedInput));
	jsCode = replaceMatchExpressions(jsCode);
	jsCode = replaceYieldWithReturn(jsCode);
	jsCode = replaceForLoops(jsCode);
	jsCode = replaceIfExpressions(jsCode);
	jsCode = replaceBooleans(jsCode);
	jsCode = stripTypeSuffixes(jsCode);
	jsCode = replaceReadCalls(jsCode);
	jsCode = replaceFunctionDefinitions(jsCode);
	const usesStdin = input.includes('read<');
	jsCode = wrapCompiledCode(jsCode, usesStdin);

	return ok(jsCode);
}
