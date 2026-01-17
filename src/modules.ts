import { err, ok, type Result } from './common/result';
import { findClosingBrace, type ContextAndRemaining, type ExecutionContext } from './common/types';
import { stripLeadingSemicolon } from './common/helpers';

/**
 * Global registry of module definitions (module name -> module namespace with functions).
 */
const moduleRegistry: Map<string, ExecutionContext> = new Map();

/**
 * Check if a string is a valid identifier.
 */
function isValidIdentifier(name: string): boolean {
	if (name.length === 0) {
		return false;
	}
	const firstChar = name.charAt(0);
	const isFirstValid =
		(firstChar >= 'a' && firstChar <= 'z') ||
		(firstChar >= 'A' && firstChar <= 'Z') ||
		firstChar === '_';
	if (!isFirstValid) {
		return false;
	}
	for (let i = 1; i < name.length; i = i + 1) {
		const char = name.charAt(i);
		const isValid =
			(char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char === '_';
		if (!isValid) {
			return false;
		}
	}
	return true;
}

/**
 * Registers a module definition.
 */
export function registerModule(name: string, context: ExecutionContext): Result<void> {
	if (moduleRegistry.has(name)) {
		return err(`Module '${name}' is already defined`);
	}
	moduleRegistry.set(name, context);
	return ok(undefined as void);
}

/**
 * Gets a module definition from registry.
 */
export function getModule(name: string): ExecutionContext | undefined {
	return moduleRegistry.get(name);
}

/**
 * Clears module registry (for testing).
 */
export function clearModuleRegistry(): void {
	moduleRegistry.clear();
}

/**
 * Checks if input starts with a module definition.
 */
export function isModuleDefinition(input: string): boolean {
	return input.trim().startsWith('module ');
}

/**
 * Parses a module definition statement.
 */
export function parseModuleDefinition(
	input: string,
	context: ExecutionContext,
	processStatements: (
		input: string,
		ctx: ExecutionContext,
		allowBlocks: boolean,
		registerGlobally: boolean,
	) => Result<ContextAndRemaining>,
): Result<ContextAndRemaining> {
	const trimmed = input.trim();
	if (!trimmed.startsWith('module ')) {
		return err('Not a module definition');
	}

	const afterModule = trimmed.substring(7).trim();
	const braceIndex = afterModule.indexOf('{');
	if (braceIndex < 0) {
		return err('Module definition missing opening brace');
	}

	const moduleName = afterModule.substring(0, braceIndex).trim();
	const isValidName = moduleName.length > 0 && isValidIdentifier(moduleName);
	if (!isValidName) {
		return err(`Invalid module name: ${moduleName}`);
	}

	const afterName = afterModule.substring(braceIndex);
	const closingBraceIndex = findClosingBrace(afterName);
	if (closingBraceIndex < 0) {
		return err('Module definition missing closing brace');
	}

	const moduleContent = afterName.substring(1, closingBraceIndex);
	const remaining = stripLeadingSemicolon(afterName.substring(closingBraceIndex + 1));

	// Process the module content with a fresh context to capture definitions
	const moduleContextResult = processStatements(moduleContent, { bindings: [] }, true, true);
	if (moduleContextResult.type === 'err') {
		return moduleContextResult;
	}

	// Register the module
	const registerResult = registerModule(moduleName, moduleContextResult.value.context);
	if (registerResult.type === 'err') {
		return registerResult;
	}

	return ok({ context, remaining });
}
