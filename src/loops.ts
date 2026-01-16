import { err, ok, type Result } from './result';
import {
	findClosingBrace,
	findClosingParen,
	findSemicolonOutsideBrackets,
	type ContextAndRemaining,
	type ExecutionContext,
	isVariableName,
	type VariableBinding,
} from './types';
import { interpretInternal } from './evaluator';

/**
 * Represents a parsed range with start and end values.
 */
export interface ParsedRange {
	start: number;
	end: number;
}

/**
 * Parses a range expression like "0..10" into start and end numbers.
 * @param rangeStr - The range string (e.g., "0..10")
 * @returns ParsedRange with start and end values, or undefined if invalid
 */
function parseRangeExpression(rangeStr: string): ParsedRange | undefined {
	const trimmed = rangeStr.trim();
	const dotDotIndex = trimmed.indexOf('..');

	if (dotDotIndex < 0) {
		return undefined;
	}

	const startStr = trimmed.substring(0, dotDotIndex).trim();
	const endStr = trimmed.substring(dotDotIndex + 2).trim();

	const startNum = Number.parseInt(startStr, 10);
	const endNum = Number.parseInt(endStr, 10);

	if (Number.isNaN(startNum) || Number.isNaN(endNum)) {
		return undefined;
	}

	return { start: startNum, end: endNum };
}

/**
 * Represents extracted loop body information.
 */
interface BodyExtractionResult {
	bodyStr: string;
	remaining: string;
}

/**
 * Extracts the loop body from a string after a condition or declaration.
 * Handles both braced and single-statement bodies.
 */
function extractLoopBody(afterKeyword: string): Result<BodyExtractionResult> {
	if (afterKeyword.length === 0) {
		return err('Invalid loop: missing body');
	}

	if (afterKeyword.startsWith('{')) {
		const braceEnd = findClosingBrace(afterKeyword);
		if (braceEnd < 0) {
			return err('Invalid loop body: missing closing brace');
		}

		const bodyStr = afterKeyword.substring(0, braceEnd + 1);
		let remaining = afterKeyword.substring(braceEnd + 1).trim();
		if (remaining.startsWith(';')) {
			remaining = remaining.substring(1).trim();
		}

		return ok({ bodyStr, remaining });
	}

	const semiIndex = findSemicolonOutsideBrackets(afterKeyword);
	if (semiIndex < 0) {
		return err('Invalid loop body: missing semicolon');
	}

	const bodyStr = `${afterKeyword.substring(0, semiIndex)};`;
	const remaining = afterKeyword.substring(semiIndex + 1).trim();
	return ok({ bodyStr, remaining });
}

/**
 * Executes a single iteration of a loop body in the given context.
 */
function executeLoopBodyIteration(
	bodyStr: string,
	context: ExecutionContext,
	processStatements: (
		input: string,
		ctx: ExecutionContext,
		allowBlocks: boolean,
	) => Result<ContextAndRemaining>,
): Result<ExecutionContext> {
	let bodyInput = bodyStr;
	if (bodyStr.trim().startsWith('{')) {
		bodyInput = `${bodyStr};`;
	}

	const bodyResult = processStatements(bodyInput, context, true);
	if (bodyResult.type === 'err') {
		return bodyResult;
	}

	return ok(bodyResult.value.context);
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

		const bodyResult = executeLoopBodyIteration(bodyStr, currentContext, processStatements);
		if (bodyResult.type === 'err') {
			return bodyResult;
		}

		currentContext = bodyResult.value;
		iterationCount++;
	}

	if (iterationCount >= MAX_ITERATIONS) {
		return err('While loop exceeded maximum iterations');
	}

	return ok(currentContext);
}

/**
 * Validates and extracts the content after a loop keyword.
 * @param input - The full input string
 * @param keyword - The keyword to check (e.g., "while" or "for")
 * @returns The string after the keyword and opening paren, or an error
 */
function parseLoopHeader(input: string, keyword: string): Result<string> {
	const trimmed = input.trim();
	if (!trimmed.startsWith(`${keyword} `)) {
		return err(`Not a ${keyword} statement`);
	}

	const afterKeyword = trimmed.substring(keyword.length + 1).trim();
	if (!afterKeyword.startsWith('(')) {
		return err(`Invalid ${keyword} statement`);
	}

	return ok(afterKeyword);
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
	const afterWhileResult = parseLoopHeader(input, 'while');
	if (afterWhileResult.type === 'err') {
		return afterWhileResult;
	}

	const afterWhile = afterWhileResult.value;
	const conditionEnd = findClosingParen(afterWhile);
	if (conditionEnd < 0) {
		return err('Invalid while condition: missing closing parenthesis');
	}

	const conditionStr = afterWhile.substring(1, conditionEnd);
	const afterCondition = afterWhile.substring(conditionEnd + 1).trim();

	const bodyExtractionResult = extractLoopBody(afterCondition);
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

/**
 * Checks if a string is a for loop statement (for (let mut i in range) statement).
 * @param input - The input string
 * @returns True if the string starts with 'for', false otherwise
 */
export function isForStatement(input: string): boolean {
	const trimmed = input.trim();
	if (!trimmed.startsWith('for ')) {
		return false;
	}

	const afterFor = trimmed.substring(4).trim();
	return afterFor.startsWith('(');
}

/**
 * Represents parsed for loop declaration parts.
 */
interface ParsedForDeclaration {
	iteratorName: string;
	isMutable: boolean;
	start: number;
	end: number;
}

/**
 * Parses the for loop declaration string (e.g., "let mut i in 0..10").
 */
function parseForDeclaration(declStr: string): Result<ParsedForDeclaration> {
	const inIndex = declStr.lastIndexOf(' in ');
	if (inIndex < 0) {
		return err('Invalid for declaration: missing "in" keyword');
	}

	const varPartStr = declStr.substring(0, inIndex).trim();
	const rangePartStr = declStr.substring(inIndex + 4).trim();

	// Parse variable part (let mut i or let i)
	if (!varPartStr.startsWith('let ')) {
		return err('Invalid for declaration: must start with "let"');
	}

	const afterLet = varPartStr.substring(4).trim();
	let isMutable = false;
	let iteratorName = afterLet;

	if (afterLet.startsWith('mut ')) {
		isMutable = true;
		iteratorName = afterLet.substring(4).trim();
	}

	if (!isVariableName(iteratorName)) {
		return err(`Invalid iterator variable name: ${iteratorName}`);
	}

	// Parse range
	const rangeResult = parseRangeExpression(rangePartStr);
	if (rangeResult === undefined) {
		return err(`Invalid range expression: ${rangePartStr}`);
	}

	const { start, end } = rangeResult;
	return ok({ iteratorName, isMutable, start, end });
}

/**
 * Executes the for loop with the given iterator variable, range, and body.
 */
function executeForLoop(
	iteratorName: string,
	start: number,
	end: number,
	bodyStr: string,
	context: ExecutionContext,
	processStatements: (
		input: string,
		ctx: ExecutionContext,
		allowBlocks: boolean,
	) => Result<ContextAndRemaining>,
): Result<ExecutionContext> {
	let currentContext = context;

	for (let i = start; i < end; i++) {
		const newBindings = currentContext.bindings.map((binding): VariableBinding => {
			if (binding.name === iteratorName) {
				return { ...binding, value: i };
			}
			return binding;
		});

		currentContext = { bindings: newBindings };

		const bodyResult = executeLoopBodyIteration(bodyStr, currentContext, processStatements);
		if (bodyResult.type === 'err') {
			return bodyResult;
		}

		currentContext = bodyResult.value;
	}

	return ok(currentContext);
}

/**
 * Creates the result context by filtering out the iterator variable.
 */
function createResultContext(
	loopContext: ExecutionContext,
	iteratorName: string,
): ExecutionContext {
	const resultBindings = loopContext.bindings.filter(
		(binding): boolean => binding.name !== iteratorName,
	);
	return { bindings: resultBindings };
}

/**
 * Represents parsed for loop components ready for execution.
 */
interface ParsedForComponents {
	iteratorName: string;
	start: number;
	end: number;
	bodyStr: string;
	remaining: string;
	newContext: ExecutionContext;
}

/**
 * Parses and validates for loop components.
 */
function parseForComponents(
	afterFor: string,
	context: ExecutionContext,
): Result<ParsedForComponents> {
	const declEnd = findClosingParen(afterFor);
	if (declEnd < 0) {
		return err('Invalid for declaration: missing closing parenthesis');
	}

	const declStr = afterFor.substring(1, declEnd);
	const afterDecl = afterFor.substring(declEnd + 1).trim();

	// Parse declaration
	const declResult = parseForDeclaration(declStr);
	if (declResult.type === 'err') {
		return declResult;
	}

	const { iteratorName, isMutable, start, end } = declResult.value;

	// Extract body
	const bodyExtractionResult = extractLoopBody(afterDecl);
	if (bodyExtractionResult.type === 'err') {
		return bodyExtractionResult;
	}

	const { bodyStr, remaining } = bodyExtractionResult.value;

	// Add iterator to context
	const newBindings = [...context.bindings, { name: iteratorName, value: start, isMutable }];
	const newContext: ExecutionContext = { bindings: newBindings };

	return ok({ iteratorName, start, end, bodyStr, remaining, newContext });
}

export function processForStatement(
	input: string,
	context: ExecutionContext,
	processStatements: (
		input: string,
		ctx: ExecutionContext,
		allowBlocks: boolean,
	) => Result<ContextAndRemaining>,
): Result<ContextAndRemaining> {
	const afterForResult = parseLoopHeader(input, 'for');
	if (afterForResult.type === 'err') {
		return afterForResult;
	}

	const afterFor = afterForResult.value;
	const componentsResult = parseForComponents(afterFor, context);
	if (componentsResult.type === 'err') {
		return componentsResult;
	}

	const { iteratorName, start, end, bodyStr, remaining, newContext } = componentsResult.value;

	const loopResult = executeForLoop(
		iteratorName,
		start,
		end,
		bodyStr,
		newContext,
		processStatements,
	);
	if (loopResult.type === 'err') {
		return loopResult;
	}

	const resultContext = createResultContext(loopResult.value, iteratorName);
	return ok({ context: resultContext, remaining });
}
