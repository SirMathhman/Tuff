import {
	checkSingleCharOperator,
	checkTwoCharOperator,
	type OperatorMatch,
	type OperatorPrecedenceState,
} from './common/types';

export { parseLiteral } from './literal-parser';

/**
 * Updates the lowest precedence state with a new operator.
 */
function updateLowestPrecedence(
	precedence: number,
	index: number,
	operator: string,
	state: OperatorPrecedenceState,
): void {
	if (precedence <= state.lowestPrecedence) {
		state.lowestPrecedence = precedence;
		state.lowestPrecedenceIndex = index;
		state.lowestPrecedenceOperator = operator;
	}
}

/**
 * Checks for operators at a specific position in the input.
 */
function checkOperatorAtPosition(
	input: string,
	i: number,
	char: string,
	operators: string[],
	state: OperatorPrecedenceState,
): number {
	if (i < input.length - 1) {
		const twoCharPrec = checkTwoCharOperator(input, i, operators);
		if (twoCharPrec >= 0) {
			updateLowestPrecedence(twoCharPrec, i, input.substring(i, i + 2), state);
			return 1; // Signal to skip next char
		}
	}
	const singleCharPrec = checkSingleCharOperator(input, char, i, operators);
	if (singleCharPrec >= 0) {
		updateLowestPrecedence(singleCharPrec, i, char, state);
	}
	return 0;
}

/**
 * Finds the lowest-precedence operator in an expression.
 */
export function findOperator(input: string): OperatorMatch | undefined {
	const operators = ['+', '-', '*', '/', '||', '&&', '<', '>', '<=', '>=', '==', '!='];
	const state: OperatorPrecedenceState = {
		lowestPrecedence: Infinity,
		lowestPrecedenceIndex: -1,
		lowestPrecedenceOperator: '',
	};
	let bracketDepth = 0;
	let squareBracketDepth = 0;
	if (input.startsWith('(') || input.startsWith('{')) {
		bracketDepth = 1;
	} else if (input.startsWith('[')) {
		squareBracketDepth = 1;
	}
	for (let i = 1; i < input.length; i++) {
		const char = input[i];
		if (char === '(' || char === '{') {
			bracketDepth++;
			continue;
		}
		if (char === ')' || char === '}') {
			bracketDepth--;
			continue;
		}
		if (char === '[') {
			squareBracketDepth++;
			continue;
		}
		if (char === ']') {
			squareBracketDepth--;
			continue;
		}
		if (bracketDepth > 0 || squareBracketDepth > 0) {
			continue;
		}
		const skip = checkOperatorAtPosition(input, i, char, operators, state);
		if (skip) {
			i++;
		}
	}
	if (state.lowestPrecedenceIndex < 0) {
		return undefined;
	}
	return {
		operator: state.lowestPrecedenceOperator,
		index: state.lowestPrecedenceIndex,
		precedence: state.lowestPrecedence,
	};
}
