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
		var memberCall = tryParseMemberCall(expr, functionRegistry,
																				capturedVariables);
		if (memberCall != null) {
			return memberCall;
		}

		// Pattern: identifier()() - two sets of parentheses
		var pattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(\\s*\\)\\s*\\(\\s*\\)$");
		var matcher = pattern.matcher(expr.trim());
		if (!matcher.matches()) {
			return null;
		}

		var outerFuncName = matcher.group(1);
		var outerFunc = functionRegistry.get(outerFuncName);
		if (outerFunc == null) {
			return null;
		}

		// Get the body of outer function - it should return a function reference
		var body = outerFunc.body().trim();

		// The body might be a block: { fn inner() => ...; inner }
		if (body.startsWith("{") && body.endsWith("}")) {
			var blockContent = body.substring(1, body.length() - 1).trim();

			// Check if block contains a nested function definition
			if (blockContent.startsWith("fn ")) {
				return FunctionHandler.parseFunctionDefinition(blockContent, capturedVariables).match(
						parsed -> {
							// Register the inner function temporarily
							var innerFuncName = parsed.functionDef().name();
							functionRegistry.put(innerFuncName, parsed.functionDef());

							// The remaining part should be the function reference (e.g., "inner")
							var remaining = parsed.remaining().trim();
							if (!remaining.equals(innerFuncName)) {
								return null;
							}
							// The block returns the function reference, now call it
							return FunctionHandler.parseFunctionCall(innerFuncName + "()", functionRegistry, capturedVariables)
									.flatMap(innerBody -> App.parseExpressionWithRead(innerBody, functionRegistry,
											capturedVariables));
						},
						Result::err);
			}
		}

		return null;
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> tryParseMemberCall(String expr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		// Pattern: identifier().member()
		var p = Pattern.compile(
				"^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(\\s*\\)\\s*\\.\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(\\s*\\)$");
		var m = p.matcher(expr.trim());
		if (!m.matches()) {
			return null;
		}

		var outerFuncName = m.group(1);
		var memberName = m.group(2);
		var outerFunc = functionRegistry.get(outerFuncName);
		if (outerFunc == null) {
			return null;
		}

		var body = outerFunc.body().trim();
		if (!body.startsWith("{") || !body.endsWith("}")) {
			return null;
		}
		var blockContent = body.substring(1, body.length() - 1).trim();
		if (!blockContent.startsWith("fn ")) {
			return null;
		}

		return FunctionHandler.parseFunctionDefinition(blockContent, capturedVariables).match(
				parsed -> {
					if (!parsed.remaining().trim().equals("this")) {
						return null;
					}
					if (!parsed.functionDef().name().equals(memberName)) {
						return null;
					}

					var previous = functionRegistry.get(memberName);
					functionRegistry.put(memberName, parsed.functionDef());
					try {
						return FunctionHandler.parseFunctionCall(memberName + "()", functionRegistry, capturedVariables)
								.flatMap(innerBody -> App.parseExpressionWithRead(innerBody, functionRegistry,
										capturedVariables));
					} finally {
						if (previous == null) {
							functionRegistry.remove(memberName);
						} else {
							functionRegistry.put(memberName, previous);
						}
					}
				},
				Result::err);
	}
}
