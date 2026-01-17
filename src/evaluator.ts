import { err, ok, type Result } from './common/result';
import {
	collectTypeSuffixes,
	type ExecutionContext,
	getTypeRangeMax,
	type StatementsModule,
	validateValueForType,
} from './common/types';
import { parseLiteral, findOperator } from './parser';

/**
 * Evaluates a comparison operation.
 */
function evaluateComparison(left: number, operator: string, right: number): Result<number> {
	if (operator === '<') {
		return ok(Number(left < right));
	}

	if (operator === '>') {
		return ok(Number(left > right));
	}

	if (operator === '<=') {
		return ok(Number(left <= right));
	}

	if (operator === '>=') {
		return ok(Number(left >= right));
	}

	if (operator === '==') {
		return ok(Number(left === right));
	}

	if (operator === '!=') {
		return ok(Number(left !== right));
	}

	return err(`Unknown comparison operator: ${operator}`);
}

/**
 * Evaluates a binary operation with the given operator and operands.
 */
export function evaluateBinaryOp(left: number, operator: string, right: number): Result<number> {
	if (operator === '+') {
		return ok(left + right);
	}

	if (operator === '-') {
		return ok(left - right);
	}

	if (operator === '*') {
		return ok(left * right);
	}

	if (operator === '/') {
		if (right === 0) {
			return err('Division by zero');
		}

		return ok(Math.floor(left / right));
	}

	if (operator === '||') {
		const result = left !== 0 || right !== 0;
		return ok(Number(result));
	}

	if (operator === '&&') {
		const result = left !== 0 && right !== 0;
		return ok(Number(result));
	}

	const comparisonResult = evaluateComparison(left, operator, right);
	if (comparisonResult.type === 'ok') {
		return comparisonResult;
	}

	return err(`Unknown operator: ${operator}`);
}

/**
 * Interprets a mathematical expression with variable context.
 * Recursively parses and evaluates binary operations and literals.
 */
export function interpretInternal(input: string, context: ExecutionContext): Result<number> {
	const operatorMatch = findOperator(input);

	if (operatorMatch === undefined) {
		// Lazy import to avoid circular dependency
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const statementsModule = require('./statements') as StatementsModule;
		return parseLiteral(input, context, interpretInternal, statementsModule.processVariableBindings);
	}

	const { operator, index: operatorIndex } = operatorMatch;
	const leftStr = input.substring(0, operatorIndex);
	const rightStr = input.substring(operatorIndex + operator.length);

	const leftInterpret = interpretInternal(leftStr, context);
	if (leftInterpret.type === 'err') {
		return leftInterpret;
	}

	const rightInterpret = interpretInternal(rightStr, context);
	if (rightInterpret.type === 'err') {
		return rightInterpret;
	}

	const opResult = evaluateBinaryOp(leftInterpret.value, operator, rightInterpret.value);
	if (opResult.type === 'err') {
		return opResult;
	}

	const allTypeSuffixes = collectTypeSuffixes(input);
	if (allTypeSuffixes.length > 0) {
		const largestType = allTypeSuffixes.reduce((largest, current): string => {
			const currentMax = getTypeRangeMax(current);
			const largestMax = getTypeRangeMax(largest);
			if (currentMax >= largestMax) {
				return current;
			}
			return largest;
		});
		return validateValueForType(opResult.value, largestType);
	}

	return opResult;
}
