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
	if (typeStartIndex === -1) {
		return '';
	}
	const typeEndIndex = source.indexOf('=', typeStartIndex);
	if (typeEndIndex === -1) {
		return '';
	}
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

	// Remove type annotations for all supported types
	replaced = replaced.split(': U8').join('');
	replaced = replaced.split(': U16').join('');
	replaced = replaced.split(': I32').join('');
	replaced = replaced.split(': U32').join('');

	// Remove mut keyword
	replaced = replaced.split('mut ').join('');

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

interface VariableInfo {
	type: string | undefined;
	isMutable: boolean;
}

function getVariableNameAndType(
	source: string,
	letIndex: number,
	eqIndex: number,
): VarNameAndType | undefined {
	const typeStartIndex = source.indexOf(':', letIndex);
	const varNameStart = letIndex + 4;

	if (typeStartIndex !== -1 && typeStartIndex < eqIndex) {
		const varName = source.substring(varNameStart, typeStartIndex).trim();
		const declaredType = source.substring(typeStartIndex + 1, eqIndex).trim();
		return { name: varName, type: declaredType };
	}

	const varName = source.substring(varNameStart, eqIndex).trim();
	return { name: varName, type: undefined };
}

function isVariableMutable(source: string, letIndex: number): boolean {
	// Check if there's a 'mut' keyword between 'let' and '='
	const eqIndex = source.indexOf('=', letIndex);
	if (eqIndex === -1) {
		return false;
	}
	const betweenLetAndEq = source.substring(letIndex + 4, eqIndex);
	return betweenLetAndEq.includes('mut');
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
	variables: Map<string, VariableInfo>,
): Result<void, string> {
	// Only validate read operations for types that care about it
	if (declaredType === 'U8' || declaredType === 'U16') {
		const readCheckResult = checkReadOperationTypes(expr, declaredType);
		if (!readCheckResult.success) {
			return readCheckResult;
		}

		const varCheckResult = checkVariableAssignmentType(expr, declaredType, variables);
		if (!varCheckResult.success) {
			return varCheckResult;
		}
	}

	return success(undefined);
}

function processLetBinding(
	source: string,
	letIndex: number,
	variables: Map<string, VariableInfo>,
): ProcessResult {
	const varInfo = extractVariableTypeAndName(source, letIndex);
	if (varInfo === undefined) {
		return { nextIndex: letIndex + 4, error: undefined };
	}

	const eqIndex = source.indexOf('=', letIndex);
	const expr = source.substring(eqIndex + 1, varInfo.exprEnd).trim();
	const isMutable = isVariableMutable(source, letIndex);

	if (varInfo.type !== undefined && (varInfo.type.startsWith('U') || varInfo.type === 'I32')) {
		const result = validateLetBindingForType(expr, varInfo.type, variables);
		if (!result.success) {
			return { nextIndex: varInfo.exprEnd + 1, error: result.error };
		}
	}

	// Always track the variable, regardless of type
	variables.set(varInfo.name, { type: varInfo.type, isMutable });

	return { nextIndex: varInfo.exprEnd + 1, error: undefined };
}

function validateLetBindingTypes(source: string): Result<void, string> {
	// Check for type mismatches in let bindings
	// Pattern: let <name> : <type> = <expr> or let <name> = <expr>
	// Also track variable types for validation
	const variables = new Map<string, VariableInfo>();
	let searchIndex = 0;
	while (searchIndex < source.length) {
		const letIndex = source.indexOf('let ', searchIndex);
		if (letIndex === -1) {
			break;
		}

		const processResult = processLetBinding(source, letIndex, variables);
		if (processResult.error !== undefined) {
			return failure(processResult.error);
		}

		searchIndex = processResult.nextIndex;
	}

	// Check for reassignments to immutable variables (x = ... without let)
	const reassignmentCheckResult = checkReassignments(source, variables);
	if (!reassignmentCheckResult.success) {
		return reassignmentCheckResult;
	}

	return success(undefined);
}

function isSimpleIdentifier(varPart: string): boolean {
	// Check if it's a simple identifier (alphanumeric and underscore only)
	if (varPart.length === 0) {
		return false;
	}
	for (let i = 0; i < varPart.length; i++) {
		const ch = varPart.charAt(i);
		const isAlphaNum =
			(ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_';
		if (!isAlphaNum) {
			return false;
		}
	}
	return true;
}

function checkVariableReassignment(
	varName: string,
	variables: Map<string, VariableInfo>,
): Result<void, string> {
	if (variables.has(varName)) {
		const varInfo = variables.get(varName);
		if (varInfo && !varInfo.isMutable) {
			return failure(`Cannot assign to immutable variable '${varName}'`);
		}
	}
	return success(undefined);
}

function checkReassignments(
	source: string,
	variables: Map<string, VariableInfo>,
): Result<void, string> {
	// Split source into statements (by semicolon)
	const statements = source
		.split(';')
		.map((s: string): string => s.trim())
		.filter((s: string): boolean => s.length > 0);

	for (const stmt of statements) {
		// If statement doesn't start with 'let', it's a potential reassignment
		if (stmt.startsWith('let ')) {
			continue;
		}

		// Check if it contains an assignment (=)
		const eqIndex = stmt.indexOf('=');
		if (eqIndex === -1 || eqIndex === 0) {
			continue;
		}

		// Extract variable name (should be before the =)
		const varPart = stmt.substring(0, eqIndex).trim();
		// Check if it's a simple identifier
		if (!isSimpleIdentifier(varPart)) {
			continue;
		}

		const varName = varPart;
		const result = checkVariableReassignment(varName, variables);
		if (!result.success) {
			return result;
		}
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
	variables: Map<string, VariableInfo>,
): Result<void, string> {
	// Check if the expression is just a variable reference
	const trimmedExpr = expr.trim();
	if (variables.has(trimmedExpr)) {
		const variableInfo = variables.get(trimmedExpr);
		const sourceType = variableInfo?.type;
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

	// Replace occurrences of all read operations with runtime expressions
	let replaced = source;
	const readTypes = ['read I32', 'read U32', 'read U16', 'read U8'];
	const replacement = 'Number(stdin.shift())';

	for (const readType of readTypes) {
		let index = replaced.indexOf(readType);
		while (index !== -1) {
			replaced =
				replaced.substring(0, index) + replacement + replaced.substring(index + readType.length);
			index = replaced.indexOf(readType);
		}
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
