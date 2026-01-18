import { err, ok, type Result } from '../common/result';
import {
	findMatchingParen,
	isIdentifierStartChar,
	isKeywordAt,
	parseIdentifier,
	skipWhitespaceInCode,
} from './compiler-utils';
import {
	collectFunctionParamCounts,
	countCommaSeparatedItems,
	parseLetFunctionReferenceTarget,
	previousNonWhitespaceChar,
	type FunctionRefTarget,
} from './function-validation-parse';

function countCallArguments(code: string, openParenIdx: number, closeParenIdx: number): number {
	const argsText = code.substring(openParenIdx + 1, closeParenIdx);
	return countCommaSeparatedItems(argsText);
}

function validateCallAt(
	code: string,
	name: string,
	openParenIdx: number,
	functions: Map<string, number>,
	refTargets: Map<string, FunctionRefTarget>,
): Result<void> {
	const closeParenIdx = findMatchingParen(code, openParenIdx);
	if (closeParenIdx < 0) {
		return ok(undefined as void);
	}

	const argCount = countCallArguments(code, openParenIdx, closeParenIdx);

	const refTarget = refTargets.get(name);
	if (refTarget !== undefined) {
		if (argCount !== refTarget.paramCount) {
			return err(
				`Function '${refTarget.functionName}' expects ${refTarget.paramCount} argument(s), got ${argCount}`,
			);
		}
		return ok(undefined as void);
	}

	const directExpected = functions.get(name);
	if (directExpected !== undefined && argCount !== directExpected) {
		return err(`Function '${name}' expects ${directExpected} argument(s), got ${argCount}`);
	}

	return ok(undefined as void);
}

function shouldSkipIdentifierForCalls(code: string, idx: number): boolean {
	if (isKeywordAt(code, idx, 'fn')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'let')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'if')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'for')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'while')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'match')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'return')) {
		return true;
	}
	if (isKeywordAt(code, idx, 'yield')) {
		return true;
	}
	return false;
}

function validateFunctionReferenceCalls(
	code: string,
	functions: Map<string, number>,
	refTargets: Map<string, FunctionRefTarget>,
): Result<void> {
	let i = 0;
	while (i < code.length) {
		if (!isIdentifierStartChar(code[i])) {
			i += 1;
			continue;
		}
		if (shouldSkipIdentifierForCalls(code, i)) {
			i += 1;
			continue;
		}

		const prev = previousNonWhitespaceChar(code, i);
		if (prev === '.') {
			i += 1;
			continue;
		}

		const name = parseIdentifier(code, i);
		if (name.length === 0) {
			i += 1;
			continue;
		}

		let j = i + name.length;
		j = skipWhitespaceInCode(code, j);
		if (j >= code.length || code[j] !== '(') {
			i = i + name.length;
			continue;
		}

		const result = validateCallAt(code, name, j, functions, refTargets);
		if (result.type === 'err') {
			return result;
		}

		const closeParenIdx = findMatchingParen(code, j);
		if (closeParenIdx < 0) {
			i = j + 1;
			continue;
		}
		i = closeParenIdx + 1;
	}

	return ok(undefined as void);
}

export function validateFunctionReferences(code: string): Result<void> {
	const functions = collectFunctionParamCounts(code);
	const refTargets = new Map<string, FunctionRefTarget>();

	let i = 0;
	while (i < code.length) {
		if (!isKeywordAt(code, i, 'let')) {
			i += 1;
			continue;
		}

		const parsed = parseLetFunctionReferenceTarget(code, i, functions);
		if (parsed.type === 'err') {
			return parsed;
		}
		if (parsed.value !== undefined) {
			refTargets.set(parsed.value.varName, parsed.value.target);
			i = parsed.value.nextIdx;
			continue;
		}

		i += 1;
	}

	return validateFunctionReferenceCalls(code, functions, refTargets);
}
