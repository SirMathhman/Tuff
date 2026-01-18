import { Result, success, failure } from './result';

function findSemicolonIndex(source: string, startPos: number): number {
	let braceDepth = 0;
	for (let i = startPos; i < source.length; i++) {
		if (source[i] === '{') {
			braceDepth++;
		} else if (source[i] === '}') {
			braceDepth--;
		} else if (source[i] === ';' && braceDepth === 0) {
			return i;
		}
	}
	return -1;
}

function getDeclaredType(source: string, letIndex: number): string {
	const typeStartIndex = source.indexOf(':', letIndex);
	const typeEndIndex = source.indexOf('=', typeStartIndex);
	return source.substring(typeStartIndex + 1, typeEndIndex).trim();
}

function shouldWrapWithMask(declaredType: string): boolean {
	return declaredType === 'U8';
}

function wrapExpressionForType(expr: string, declaredType: string): string {
	let wrappedExpr: string;
	if (shouldWrapWithMask(declaredType)) {
		wrappedExpr = `(${expr} & 0xff)`;
	} else {
		wrappedExpr = `(${expr})`;
	}
	return wrappedExpr;
}

function wrapLetBindings(source: string): string {
	let replaced = source;
	let searchIndex = 0;
	while (searchIndex < replaced.length) {
		const letIndex = replaced.indexOf('let ', searchIndex);
		if (letIndex === -1) {
			break;
		}
		const eqIndex = replaced.indexOf('=', letIndex);
		if (eqIndex === -1) {
			searchIndex = letIndex + 4;
			continue;
		}

		const semiIndex = findSemicolonIndex(replaced, eqIndex + 1);
		if (semiIndex === -1) {
			searchIndex = letIndex + 4;
			continue;
		}

		const declaredType = getDeclaredType(replaced, letIndex);
		const expr = replaced.substring(eqIndex + 1, semiIndex).trim();
		const before = replaced.substring(0, eqIndex + 1);
		const after = replaced.substring(semiIndex);
		const wrappedExpr = wrapExpressionForType(expr, declaredType);
		replaced = `${before} ${wrappedExpr} ${after}`;
		searchIndex = semiIndex + 10;
	}
	return replaced;
}

function handleBracesInLetBindings(source: string): string {
	let replaced = source;
	// Replace braces with IIFE wrapper
	replaced = replaced.split('{').join('(() => { ');
	replaced = replaced.split('}').join('})()');

	// Ensure the last expression in blocks is returned
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!replaced.includes(';')) {
		return replaced;
	}

	const blockEndIndex = replaced.lastIndexOf('})()');
	if (blockEndIndex === -1) {
		return replaced;
	}

	const beforeBlockEnd = replaced.substring(0, blockEndIndex);
	const afterBlockEnd = replaced.substring(blockEndIndex);
	const lastSemicolonIndex = beforeBlockEnd.lastIndexOf(';');

	if (lastSemicolonIndex === -1) {
		return replaced;
	}

	const segmentBeforeReturn = beforeBlockEnd.substring(0, lastSemicolonIndex + 1);
	const segmentToReturn = beforeBlockEnd.substring(lastSemicolonIndex + 1).trim();
	return `${segmentBeforeReturn} return ${segmentToReturn}; ${afterBlockEnd}`;
}

function isTopLevelLet(source: string): boolean {
	const trimmed = source.trimStart();
	return trimmed.startsWith('let ') && trimmed.includes('=');
}

function wrapTopLevelLet(source: string): string {
	const lastSemiIndex = source.lastIndexOf(';');
	if (lastSemiIndex === -1) {
		return `(function() { return ${source}; })()`;
	}

	const lastStmt = source.substring(lastSemiIndex + 1).trim();
	// Check if last statement is a single identifier
	if (lastStmt && lastStmt.indexOf(' ') === -1 && lastStmt.indexOf('(') === -1) {
		const beforeLastStmt = source.substring(0, lastSemiIndex + 1);
		return `(function() { ${beforeLastStmt} return ${lastStmt}; })()`;
	}
	return `(function() { ${source} })()`;
}

function handleLetBindings(source: string): string {
	let replaced = source;

	// First, wrap expressions in let assignments with & 0xff (for U8) or just parentheses (for U16)
	replaced = wrapLetBindings(replaced);

	// Then handle braces - only if there are any
	if (replaced.includes('{')) {
		replaced = handleBracesInLetBindings(replaced);
	}

	// Remove type annotations for both U8 and U16
	replaced = replaced.split(': U8').join('');
	replaced = replaced.split(': U16').join('');

	// For top-level let bindings, convert to return the value
	if (isTopLevelLet(replaced)) {
		replaced = wrapTopLevelLet(replaced);
	}

	return replaced;
}

function inferTypeFromExpression(expr: string): string | undefined {
	// Infer the type from read operations
	if (expr.includes('read U8')) {
		return 'U8';
	}
	if (expr.includes('read U16')) {
		return 'U16';
	}
	if (expr.includes('read U32')) {
		return 'U32';
	}
	if (expr.includes('read I32')) {
		return 'I32';
	}
	// For simple variable references or literals, we can't infer (needs symbol table)
	return undefined;
}

interface VarExtractionInfo {
	name: string;
	type: string | undefined;
	exprEnd: number;
}

interface VarNameAndType {
	name: string;
	type: string | undefined;
}

interface ProcessResult {
	nextIndex: number;
	error: string | undefined;
}

function getVariableNameAndType(
	source: string,
	letIndex: number,
	eqIndex: number,
): VarNameAndType | undefined {
	const typeStartIndex = source.indexOf(':', letIndex);

	if (typeStartIndex !== -1 && typeStartIndex < eqIndex) {
		const varNameStart = letIndex + 4;
		const varName = source.substring(varNameStart, typeStartIndex).trim();
		const declaredType = source.substring(typeStartIndex + 1, eqIndex).trim();
		return { name: varName, type: declaredType };
	}

	const varNameStart = letIndex + 4;
	const varName = source.substring(varNameStart, eqIndex).trim();
	return { name: varName, type: undefined };
}

function extractVariableTypeAndName(
	source: string,
	letIndex: number,
): VarExtractionInfo | undefined {
	const eqIndex = source.indexOf('=', letIndex);
	if (eqIndex === -1) {
		return undefined;
	}

	const varInfo = getVariableNameAndType(source, letIndex, eqIndex);
	if (varInfo === undefined) {
		return undefined;
	}

	const exprEndIndex = findSemicolonIndex(source, eqIndex + 1);
	if (exprEndIndex === -1) {
		return undefined;
	}

	const expr = source.substring(eqIndex + 1, exprEndIndex).trim();
	let declaredType = varInfo.type;

	// If no declared type, try to infer it
	if (declaredType === undefined) {
		declaredType = inferTypeFromExpression(expr);
	}

	return { name: varInfo.name, type: declaredType, exprEnd: exprEndIndex };
}

function validateLetBindingForType(
	expr: string,
	declaredType: string,
	variableTypes: Map<string, string>,
): Result<void, string> {
	const readCheckResult = checkReadOperationTypes(expr, declaredType);
	if (!readCheckResult.success) {
		return readCheckResult;
	}

	const varCheckResult = checkVariableAssignmentType(expr, declaredType, variableTypes);
	if (!varCheckResult.success) {
		return varCheckResult;
	}

	return success(undefined);
}

function processLetBinding(
	source: string,
	letIndex: number,
	variableTypes: Map<string, string>,
): ProcessResult {
	const varInfo = extractVariableTypeAndName(source, letIndex);
	if (varInfo === undefined) {
		return { nextIndex: letIndex + 4, error: undefined };
	}

	const eqIndex = source.indexOf('=', letIndex);
	const expr = source.substring(eqIndex + 1, varInfo.exprEnd).trim();

	if (varInfo.type !== undefined && varInfo.type.startsWith('U')) {
		const result = validateLetBindingForType(expr, varInfo.type, variableTypes);
		if (!result.success) {
			return { nextIndex: varInfo.exprEnd + 1, error: result.error };
		}
		variableTypes.set(varInfo.name, varInfo.type);
	} else if (varInfo.type !== undefined) {
		variableTypes.set(varInfo.name, varInfo.type);
	}

	return { nextIndex: varInfo.exprEnd + 1, error: undefined };
}

function validateLetBindingTypes(source: string): Result<void, string> {
	// Check for type mismatches in let bindings
	// Pattern: let <name> : <type> = <expr> or let <name> = <expr>
	// Also track variable types for validation
	const variableTypes = new Map<string, string>();
	let searchIndex = 0;
	while (searchIndex < source.length) {
		const letIndex = source.indexOf('let ', searchIndex);
		if (letIndex === -1) {
			break;
		}

		const processResult = processLetBinding(source, letIndex, variableTypes);
		if (processResult.error !== undefined) {
			return failure(processResult.error);
		}

		searchIndex = processResult.nextIndex;
	}

	return success(undefined);
}

function checkReadOperationTypes(expr: string, declaredType: string): Result<void, string> {
	if (declaredType === 'U8') {
		if (expr.includes('read U16')) {
			return failure('Type mismatch: cannot assign read U16 to U8');
		}
		if (expr.includes('read U32')) {
			return failure('Type mismatch: cannot assign read U32 to U8');
		}
		if (expr.includes('read I32')) {
			return failure('Type mismatch: cannot assign read I32 to U8');
		}
	} else if (declaredType === 'U16') {
		if (expr.includes('read U32')) {
			return failure('Type mismatch: cannot assign read U32 to U16');
		}
		if (expr.includes('read I32')) {
			return failure('Type mismatch: cannot assign read I32 to U16');
		}
	}
	return success(undefined);
}

function checkVariableAssignmentType(
	expr: string,
	targetType: string,
	variableTypes: Map<string, string>,
): Result<void, string> {
	// Check if the expression is just a variable reference
	const trimmedExpr = expr.trim();
	if (variableTypes.has(trimmedExpr)) {
		const sourceType = variableTypes.get(trimmedExpr);
		// U8 can only accept U8
		if (targetType === 'U8' && sourceType === 'U16') {
			return failure('Type mismatch: cannot assign U16 to U8');
		}
	}
	return success(undefined);
}

export function compile(source: string): Result<string, string> {
	// Minimal compiler for the tests: return JavaScript that evaluates to 0 for empty input.
	if (source.trim() === '') {
		return success('0');
	}

	// Type checking: validate let bindings don't have type mismatches
	const typeCheckResult = validateLetBindingTypes(source);
	if (!typeCheckResult.success) {
		return failure(typeCheckResult.error);
	}

	// Replace occurrences of `read U8` with a runtime expression that reads from
	// the provided `stdin`.
	let replaced = source;
	const search = 'read U8';
	// Just use a simpler replacement without declarations.
	const replacement = 'Number(stdin.shift())';

	let index = replaced.indexOf(search);
	while (index !== -1) {
		replaced = replaced.substring(0, index) + replacement + replaced.substring(index + search.length);
		index = replaced.indexOf(search);
	}

	// Handle `let x : U8 = expr;` inside `{}` by transforming it to JS.
	if (replaced.includes('let ')) {
		replaced = handleLetBindings(replaced);
	} else {
		// Standard curly brace replacement for simple grouping
		replaced = replaced.split('{').join('(').split('}').join(')');
	}

	return success(replaced);
}

export function run(source: string, stdIn: string): Result<number, string> {
	// Compile without stdin; provide `stdin` at execution time so reads can be
	// implemented as runtime expressions (easier to test and more flexible).
	const compilationResult = compile(source);
	if (!compilationResult.success) {
		return failure(compilationResult.error);
	}
	const code = compilationResult.value;

	const stdin = stdIn.split(' ').filter((s: string): boolean => {
		return s !== '';
	});
	void stdin;

	try {
		// eslint-disable-next-line no-eval
		const value = eval(`(function(stdin){ return ((${code}) & 0xff); })(stdin)`) as number;
		return success(value);
	} catch (e) {
		return failure(`Failed to evaluate '${code}': ${(e as Error).message}`);
	}
}
