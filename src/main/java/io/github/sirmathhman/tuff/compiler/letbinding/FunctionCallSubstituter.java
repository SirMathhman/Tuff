package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.Map;

/**
 * Handles substitution of function calls in expressions with their expanded
 * bodies.
 * This enables function calls to be used in arithmetic and other complex
 * expressions.
 */
public final class FunctionCallSubstituter {
	private FunctionCallSubstituter() {
	}

	/**
	 * Substitute all function calls in an expression with their expanded bodies.
	 * For example, if function `a()` returns `10`, then `a() + 20` becomes `(10) +
	 * 20`.
	 */
	public static Result<String, CompileError> substituteAllFunctionCalls(String expr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Find all function call patterns: identifier followed by parentheses
		java.util.regex.Pattern pattern = java.util.regex.Pattern
				.compile("\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(");
		java.util.regex.Matcher matcher = pattern.matcher(expr);

		StringBuilder result = new StringBuilder();
		int lastEnd = 0;

		while (matcher.find()) {
			String functionName = matcher.group(1);
			int start = matcher.start();
			int openParen = matcher.end() - 1;

			// Check if this is actually a function in the registry
			if (!functionRegistry.containsKey(functionName)) {
				continue; // Skip non-function identifiers like "read"
			}

			// Find matching closing parenthesis using depth-aware parsing
			int closeParen = FunctionDefinitionProcessor.findMatchingParen(expr, openParen);
			if (closeParen == -1) {
				return Result.err(new CompileError("Unmatched parentheses in function call"));
			}

			String functionCall = expr.substring(start, closeParen + 1);

			Result<String, CompileError> substitution = FunctionHandler.parseFunctionCall(functionCall,
					functionRegistry);
			if (substitution instanceof Result.Err<String, CompileError> err) {
				return Result.err(err.error());
			}
			String substituted = ((Result.Ok<String, CompileError>) substitution).value();

			// Append everything before this call
			result.append(expr, lastEnd, start);
			// Append substituted body wrapped in parentheses
			result.append("(").append(substituted).append(")");
			lastEnd = closeParen + 1;
		}

		// Append remaining expression
		result.append(expr.substring(lastEnd));
		return Result.ok(result.toString());
	}
}
