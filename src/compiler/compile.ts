import { err, ok, type Result } from '../common/result';
import { compileBracedExpressionsToIife, stripLetTypeAnnotations } from './block-expressions';
import {
	validateConstantExpressions,
	validateMutability,
	validateNumericLiterals,
} from './validation';
import { validateFunctionReferences } from './function-validation';
import { replaceBooleans, replaceYieldWithReturn, stripTypeSuffixes } from './transforms/basic';
import { replaceFunctionDefinitions } from './transforms/functions';
import { replaceForLoops } from './transforms/for-loops';
import { replaceIfExpressions } from './transforms/if-expressions';
import { replaceMatchExpressions } from './transforms/match-expressions';
import { compileModules } from './transforms/modules';
import { replaceReadCalls, wrapCompiledCode } from './transforms/read-and-wrap';
import { compileStructs } from './transforms/structs';
import { compileThisKeyword } from './transforms/this-keyword';

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
	const functionValidation = validateFunctionReferences(input);
	if (functionValidation.type === 'err') {
		return err(functionValidation.error);
	}

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

	// Structs and modules must be compiled BEFORE braced expressions are transformed
	// because their bodies use braces that would otherwise be treated as block expressions
	let jsCode = compileStructs(input);
	jsCode = compileModules(jsCode);

	// Function definitions must be compiled BEFORE braced expressions
	// so nested functions get converted before IIFE wrapping
	jsCode = replaceFunctionDefinitions(jsCode);

	// This keyword must be compiled BEFORE type annotations are stripped
	// so we can detect `let x : This = this` pattern
	jsCode = compileThisKeyword(jsCode);

	const wrappedInput = `{ ${jsCode} }`;
	jsCode = compileBracedExpressionsToIife(stripLetTypeAnnotations(wrappedInput));
	jsCode = replaceMatchExpressions(jsCode);
	jsCode = replaceYieldWithReturn(jsCode);
	jsCode = replaceForLoops(jsCode);
	jsCode = replaceIfExpressions(jsCode);
	jsCode = replaceBooleans(jsCode);
	jsCode = stripTypeSuffixes(jsCode);
	jsCode = replaceReadCalls(jsCode);
	const usesStdin = input.includes('read<');
	jsCode = wrapCompiledCode(jsCode, usesStdin);

	return ok(jsCode);
}
