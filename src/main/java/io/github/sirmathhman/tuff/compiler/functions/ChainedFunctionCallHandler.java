package io.github.sirmathhman.tuff.compiler.functions;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Handles chained function calls like outer()().
 * This supports higher-order functions that return function references.
 */
public final class ChainedFunctionCallHandler {
	private ChainedFunctionCallHandler() {
	}

	/**
	 * Try to parse a chained function call like outer()().
	 * This handles higher-order functions that return function references.
	 * Returns null if expr is not a chained call pattern.
	 */
	public static Result<ExpressionModel.ExpressionResult, CompileError> tryParse(String expr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		// Pattern: identifier()() - two sets of parentheses
		Pattern pattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(\\s*\\)\\s*\\(\\s*\\)$");
		Matcher matcher = pattern.matcher(expr.trim());
		if (!matcher.matches()) {
			return null;
		}

		String outerFuncName = matcher.group(1);
		FunctionHandler.FunctionDef outerFunc = functionRegistry.get(outerFuncName);
		if (outerFunc == null) {
			return null;
		}

		// Get the body of outer function - it should return a function reference
		String body = outerFunc.body().trim();

		// The body might be a block: { fn inner() => ...; inner }
		if (body.startsWith("{") && body.endsWith("}")) {
			String blockContent = body.substring(1, body.length() - 1).trim();

			// Check if block contains a nested function definition
			if (blockContent.startsWith("fn ")) {
				// Parse the nested function definition
				Result<FunctionHandler.ParsedFunction, CompileError> parsedResult = FunctionHandler
						.parseFunctionDefinition(blockContent, capturedVariables);
				if (parsedResult instanceof Result.Err<FunctionHandler.ParsedFunction, CompileError> err) {
					return Result.err(err.error());
				}
				FunctionHandler.ParsedFunction parsed = ((Result.Ok<FunctionHandler.ParsedFunction, CompileError>) parsedResult)
						.value();

				// Register the inner function temporarily
				String innerFuncName = parsed.functionDef().name();
				functionRegistry.put(innerFuncName, parsed.functionDef());

				// The remaining part should be the function reference (e.g., "inner")
				String remaining = parsed.remaining().trim();
				if (remaining.equals(innerFuncName)) {
					// The block returns the function reference, now call it
					return FunctionHandler.parseFunctionCall(innerFuncName + "()", functionRegistry, capturedVariables)
							.flatMap(innerBody -> App.parseExpressionWithRead(innerBody, functionRegistry,
									capturedVariables));
				}
			}
		}

		return null;
	}
}
