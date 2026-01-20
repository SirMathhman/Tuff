package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.Map;

/**
 * Processes function definitions in the expression parsing flow. Handles
 * storing
 * functions in the registry and managing function calls during parsing.
 */
public final class FunctionProcessor {
	private FunctionProcessor() {
	}

	/**
	 * Process a function definition by storing it in the registry and continuing
	 * with remaining code
	 */
	public static Result<ParsedFunctionStatement, CompileError> processFunctionDefinition(
			String stmt,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		return FunctionHandler.parseFunctionDefinition(stmt)
				.map(parsedFunc -> {
					// Store the function definition
					functionRegistry.put(parsedFunc.functionDef().name(), parsedFunc.functionDef());
					return new ParsedFunctionStatement(parsedFunc.functionDef(), parsedFunc.remaining());
				});
	}

	/**
	 * Record for a parsed function statement with the definition and remaining code
	 */
	public record ParsedFunctionStatement(FunctionHandler.FunctionDef functionDef, String remaining) {
	}
}
