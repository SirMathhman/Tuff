export interface NumericToken {
	consumed: number;
	digits: string;
}

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isNegativeNumberStart(code: string, idx: number): boolean {
	return code[idx] === '-' && idx + 1 < code.length && isDigit(code[idx + 1]);
}

export function isNumericStart(code: string, idx: number): boolean {
	return isDigit(code[idx]) || isNegativeNumberStart(code, idx);
}

function isSuffixChar(char: string): boolean {
	return (
		(char >= '0' && char <= '9') || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
	);
}

function countSuffixLength(code: string, startIdx: number): number {
	let length = 0;
	let checkIdx = startIdx;
	while (checkIdx < code.length && isSuffixChar(code[checkIdx])) {
		length += 1;
		checkIdx += 1;
	}
	return length;
}

function extractTypeLetters(code: string, startIdx: number): number {
	const suffixLength = countSuffixLength(code, startIdx);
	return startIdx + suffixLength;
}

function countDigits(code: string, startIdx: number): number {
	let count = 0;
	let i = startIdx;
	while (i < code.length && isDigit(code[i])) {
		count += 1;
		i += 1;
	}
	return count;
}

function skipNumericDigits(code: string, idx: number): number {
	const digitCount = countDigits(code, idx);
	return idx + digitCount;
}

function extractSuffix(code: string, numEnd: number): number {
	if (numEnd >= code.length) {
		return numEnd;
	}

	const nextChar = code[numEnd];
	if (nextChar !== 'U' && nextChar !== 'I') {
		return numEnd;
	}

	const suffixEnd = extractTypeLetters(code, numEnd + 1);
	if (suffixEnd > numEnd + 1) {
		return suffixEnd;
	}
	return numEnd;
}

export function processNumericToken(code: string, idx: number): NumericToken {
	let numStart: number;
	if (code[idx] === '-') {
		numStart = idx + 1;
	} else {
		numStart = idx;
	}
	const numEnd = skipNumericDigits(code, numStart);
	const suffixEnd = extractSuffix(code, numEnd);
	const digits = code.substring(idx, numEnd);
	const consumed = suffixEnd - idx;
	return { consumed, digits };
}
