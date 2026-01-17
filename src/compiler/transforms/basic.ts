import { isKeywordAt } from '../compiler-utils';
import { isNumericStart, processNumericToken } from '../numeric-tokens';

/**
 * Removes type suffixes from numeric literals (e.g., 100U8 -> 100).
 */
export function stripTypeSuffixes(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isNumericStart(code, i)) {
			const token = processNumericToken(code, i);
			result += token.digits;
			i += token.consumed;
		} else {
			result += code[i];
			i += 1;
		}
	}

	return result;
}

export function replaceBooleans(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isKeywordAt(code, i, 'true')) {
			result += '1';
			i += 4;
			continue;
		}

		if (isKeywordAt(code, i, 'false')) {
			result += '0';
			i += 5;
			continue;
		}

		result += code[i];
		i += 1;
	}

	return result;
}

export function replaceYieldWithReturn(code: string): string {
	let result = '';
	let i = 0;

	while (i < code.length) {
		if (isKeywordAt(code, i, 'yield')) {
			result += 'return';
			i += 5;
			continue;
		}
		result += code[i];
		i += 1;
	}

	return result;
}
