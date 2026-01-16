import { err, ok, type Result } from './result';
import {
	findClosingBrace,
	findClosingParen,
	findSemicolonOutsideBrackets,
	type ContextAndRemaining,
	type ExecutionContext,
} from './types';
import { interpretInternal } from './evaluator';

/**
 * Extracts the while body from the condition string.
 */
interface BodyExtractionResult {
	bodyStr: string;
	remaining: string;
}

function extractWhileBody(afterCondition: string): Result<BodyExtractionResult> {
	if (afterCondition.length === 0) {
		return err('Invalid while statement: missing body');
	}

	if (afterCondition.startsWith('{')) {
		const braceEnd = findClosingBrace(afterCondition);
		if (braceEnd < 0) {
			return err('Invalid while body: missing closing brace');
		}

		const bodyStr = afterCondition.substring(0, braceEnd + 1);
		let remaining = afterCondition.substring(braceEnd + 1).trim();
		if (remaining.startsWith(';')) {
			remaining = remaining.substring(1).trim();
		}

		return ok({ bodyStr, remaining });
	}

	const semiIndex = findSemicolonOutsideBrackets(afterCondition);
	if (semiIndex < 0) {
		return err('Invalid while body: missing semicolon');
	}

	const bodyStr = `${afterCondition.substring(0, semiIndex)};`;
	const remaining = afterCondition.substring(semiIndex + 1).trim();
	return ok({ bodyStr, remaining });
}

/**
 * Executes the while loop with the given condition and body.
 */
function executeWhileLoop(
	conditionStr: string,
	bodyStr: string,
	context: ExecutionContext,
	processStatements: (
		input: string,
		ctx: ExecutionContext,
		allowBlocks: boolean,
	) => Result<ContextAndRemaining>,
): Result<ExecutionContext> {
	let currentContext = context;
	let iterationCount = 0;
	const MAX_ITERATIONS = 100000;

	while (iterationCount < MAX_ITERATIONS) {
		const conditionResult = interpretInternal(conditionStr, currentContext);
		if (conditionResult.type === 'err') {
			return conditionResult;
		}

		if (conditionResult.value === 0) {
			break;
		}
		let bodyInput = bodyStr;
		if (bodyStr.trim().startsWith('{')) {
			bodyInput = `${bodyStr};`;
		}
		const bodyResult = processStatements(bodyInput, currentContext, true);
		if (bodyResult.type === 'err') {
			return bodyResult;
		}

		currentContext = bodyResult.value.context;
		iterationCount++;
	}

	if (iterationCount >= MAX_ITERATIONS) {
		return err('While loop exceeded maximum iterations');
	}

	return ok(currentContext);
}

export function processWhileStatement(
	input: string,
	context: ExecutionContext,
	processStatements: (
		input: string,
		ctx: ExecutionContext,
		allowBlocks: boolean,
	) => Result<ContextAndRemaining>,
): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('while ')) {
		return err('Not a while statement');
	}

	const afterWhile = trimmed.substring(6).trim();
	if (!afterWhile.startsWith('(')) {
		return err('Invalid while statement');
	}

	const conditionEnd = findClosingParen(afterWhile);
	if (conditionEnd < 0) {
		return err('Invalid while condition: missing closing parenthesis');
	}

	const conditionStr = afterWhile.substring(1, conditionEnd);
	const afterCondition = afterWhile.substring(conditionEnd + 1).trim();

	const bodyExtractionResult = extractWhileBody(afterCondition);
	if (bodyExtractionResult.type === 'err') {
		return bodyExtractionResult;
	}

	const { bodyStr, remaining } = bodyExtractionResult.value;
	const loopResult = executeWhileLoop(conditionStr, bodyStr, context, processStatements);
	if (loopResult.type === 'err') {
		return loopResult;
	}

	return ok({ context: loopResult.value, remaining });
}
