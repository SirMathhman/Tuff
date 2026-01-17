import {
	checkSingleCharOperator,
	checkTwoCharOperator,
	type OperatorMatch,
	type OperatorPrecedenceState,
} from '../common/types';

export { parseLiteral } from '../parser/literal-parser';

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
 * Checks if current position is opening angle bracket for type parameter.
 */
function isOpeningAngleBracket(input: string, i: number): boolean {
	if (i === 0 || input[i] !== '<') {
		return false;
	}
	const prevChar = input[i - 1];
	return prevChar === 'f' || prevChar === 'd' || prevChar === 'n' || prevChar === 'e';
}

interface BracketState {
	bracketDepth: number;
	squareBracketDepth: number;
	angleBracketDepth: number;
}

function updateBracketDepthForChar(
	char: string,
	input: string,
	i: number,
	state: BracketState,
): boolean {
	if (char === '(' || char === '{') {
		state.bracketDepth++;
		return true;
	}
	if (char === ')' || char === '}') {
		state.bracketDepth--;
		return true;
	}
	if (char === '[') {
		state.squareBracketDepth++;
		return true;
	}
	if (char === ']') {
		state.squareBracketDepth--;
		return true;
	}
	if (isOpeningAngleBracket(input, i)) {
		state.angleBracketDepth++;
		return true;
	}
	if (char === '>' && state.angleBracketDepth > 0) {
		state.angleBracketDepth--;
		return true;
	}
	return false;
}

function isInsideBrackets(state: BracketState): boolean {
	return state.bracketDepth > 0 || state.squareBracketDepth > 0 || state.angleBracketDepth > 0;
}

/**
 * Finds the lowest-precedence operator in an expression.
 */
export function findOperator(input: string): OperatorMatch | undefined {
	const operators = ['+', '-', '*', '/', '||', '&&', '<', '>', '<=', '>=', '==', '!='];
	const opState: OperatorPrecedenceState = {
		lowestPrecedence: Infinity,
		lowestPrecedenceIndex: -1,
		lowestPrecedenceOperator: '',
	};
	const brackets: BracketState = { bracketDepth: 0, squareBracketDepth: 0, angleBracketDepth: 0 };
	if (input.startsWith('(') || input.startsWith('{')) {
		brackets.bracketDepth = 1;
	} else if (input.startsWith('[')) {
		brackets.squareBracketDepth = 1;
	}
	for (let i = 1; i < input.length; i++) {
		const char = input[i];
		if (updateBracketDepthForChar(char, input, i, brackets)) {
			continue;
		}
		if (isInsideBrackets(brackets)) {
			continue;
		}
		const skip = checkOperatorAtPosition(input, i, char, operators, opState);
		if (skip) {
			i++;
		}
	}
	if (opState.lowestPrecedenceIndex < 0) {
		return undefined;
	}
	return {
		operator: opState.lowestPrecedenceOperator,
		index: opState.lowestPrecedenceIndex,
		precedence: opState.lowestPrecedence,
	};
}
