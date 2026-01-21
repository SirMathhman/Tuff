package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Handles function definitions in the form: fn name(param : Type, ...) :
 * ReturnType => body;
 */
public final class FunctionHandler {
	private FunctionHandler() {
	}

	/**
	 * Record for a function parameter: name and type
	 */
	public record FunctionParam(String name, String type) {
	}

	/**
	 * Record for a parsed function definition with parameters and captured
	 * variables
	 */
	public record FunctionDef(
			String name, List<FunctionParam> params, String returnType, String body,
			Map<String, String> capturedVariables) {
		public FunctionDef(String name, List<FunctionParam> params, String returnType, String body) {
			this(name, params, returnType, body, new java.util.HashMap<>());
		}
	}

	/**
	 * Check if a string starts with a function definition
	 */
	public static boolean isFunctionDefinition(String stmt) {
		return stmt.trim().startsWith("fn ");
	}

	/**
	 * Parse a function definition: fn name(params) : ReturnType => body; or
	 * fn name(params) => body; (return type optional)
	 * Parameters format: (param1 : Type1, param2 : Type2, ...)
	 */
	public static Result<ParsedFunction, CompileError> parseFunctionDefinition(String stmt) {
		return parseFunctionDefinition(stmt, new java.util.HashMap<>());
	}

	/**
	 * Parse a function definition with captured variable context
	 */
	public static Result<ParsedFunction, CompileError> parseFunctionDefinition(
			String stmt, Map<String, String> capturedVariables) {
		stmt = stmt.trim();

		Result<FunctionDefinitionProcessor.FunctionDefParts, CompileError> partsResult = FunctionDefinitionProcessor
				.splitFunctionDefinition(stmt);
		if (partsResult instanceof Result.Err<FunctionDefinitionProcessor.FunctionDefParts, CompileError> err) {
			return Result.err(err.error());
		}
		FunctionDefinitionProcessor.FunctionDefParts parts = ((Result.Ok<FunctionDefinitionProcessor.FunctionDefParts, CompileError>) partsResult)
				.value();
		String name = parts.name();
		String paramString = parts.params();
		String returnType = parts.returnType();
		String body = preprocessFunctionBody(parts.body());
		String remaining = parts.remaining();

		// Parse parameters
		Result<List<FunctionParam>, CompileError> paramsResult = FunctionDefinitionProcessor
				.parseParameters(paramString);
		if (paramsResult instanceof Result.Err<List<FunctionParam>, CompileError>) {
			return Result.err(((Result.Err<List<FunctionParam>, CompileError>) paramsResult).error());
		}
		List<FunctionParam> params = ((Result.Ok<List<FunctionParam>, CompileError>) paramsResult).value();

		// If return type not specified, try to infer it from the body
		if (returnType == null) {
			Result<String, CompileError> inferredType = FunctionDefinitionProcessor.inferReturnType(body);
			if (inferredType instanceof Result.Err<String, CompileError>) {
				return Result.err(((Result.Err<String, CompileError>) inferredType).error());
			}
			returnType = ((Result.Ok<String, CompileError>) inferredType).value();
		} else {
			// Validate return type - check against valid types
			if (!returnType.matches(
					"([UI]\\d+|I32|Bool|[A-Z][a-zA-Z0-9_]*|\\*[a-zA-Z_][a-zA-Z0-9_]*|\\*mut\\s+[a-zA-Z_][a-zA-Z0-9_]*)")) {
				return Result.err(new CompileError(
						"Invalid return type: " + returnType + ". Expected a valid type"));
			}
		}

		return Result.ok(new ParsedFunction(
				new FunctionDef(name, params, returnType, body, capturedVariables), remaining));
	}

	private static String preprocessFunctionBody(String body) {
		return desugarLeadingReturnOrYieldBlock(body.trim());
	}

	private static String desugarLeadingReturnOrYieldBlock(String body) {
		if (!body.startsWith("{")) {
			return body;
		}
		int closingBrace = DepthAwareSplitter.findMatchingBrace(body, 0);
		if (closingBrace == -1) {
			return body;
		}

		String inner = body.substring(1, closingBrace).trim();
		String suffix = body.substring(closingBrace + 1).trim();

		int semiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(inner, 0);
		if (semiIdx == -1) {
			return body;
		}

		String firstStmt = inner.substring(0, semiIdx).trim();
		String fallback = inner.substring(semiIdx + 1).trim();
		if (!firstStmt.startsWith("if (") || fallback.isEmpty()) {
			return body;
		}

		int condEnd = ConditionalExpressionHandler.findConditionEnd(firstStmt);
		if (condEnd == -1) {
			return body;
		}
		String condition = firstStmt.substring(4, condEnd).trim();
		String afterCond = firstStmt.substring(condEnd + 1).trim();

		boolean isYield = afterCond.startsWith("yield");
		boolean isReturn = afterCond.startsWith("return");
		if (!isYield && !isReturn) {
			return body;
		}
		String valueExpr = afterCond.substring(isYield ? 5 : 6).trim();
		if (valueExpr.isEmpty()) {
			return body;
		}

		String suffixPart = suffix.isEmpty() ? "" : (" " + suffix);
		if (isYield) {
			String blockValue = "if (" + condition + ") " + valueExpr + " else " + fallback;
			return "(" + blockValue + ")" + suffixPart;
		}
		// return: short-circuit the rest of the function body
		String elseExpr = suffix.isEmpty() ? fallback : (fallback + suffixPart);
		return "if (" + condition + ") " + valueExpr + " else (" + elseExpr + ")";
	}

	/**
	 * Record for parsed function definition with remaining code
	 */
	public record ParsedFunction(FunctionDef functionDef, String remaining) {
	}

	/**
	 * Check if a string is a function call: name(...args...)
	 */
	public static boolean isFunctionCall(String expr, Map<String, FunctionDef> functionRegistry) {
		expr = expr.trim();
		FunctionCallMatch match = parseFunctionCallPattern(expr);
		return match != null && functionRegistry.containsKey(match.functionName);
	}

	public static boolean isFunctionCall(String expr, Map<String, FunctionDef> functionRegistry,
			Map<String, String> capturedVariables) {
		if (isFunctionCall(expr, functionRegistry)) {
			return true;
		}
		expr = expr.trim();
		FunctionCallMatch match = parseFunctionCallPattern(expr);
		// Check if function name is a bound function reference
		return match != null && capturedVariables.containsKey(match.functionName);
	}

	/**
	 * Parse a function call and return the body expression with arguments
	 * substituted
	 */
	public static Result<String, CompileError> parseFunctionCall(String expr,
			Map<String, FunctionDef> functionRegistry) {
		return parseFunctionCall(expr, functionRegistry, java.util.Collections.emptyMap());
	}

	public static Result<String, CompileError> parseFunctionCall(String expr,
			Map<String, FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		expr = expr.trim();
		FunctionCallMatch match = parseFunctionCallPattern(expr);

		if (match == null) {
			return Result.err(new CompileError("Invalid function call syntax"));
		}

		String functionName = match.functionName;
		String argsString = match.argsString;

		// Check if this is a bound function reference
		if (capturedVariables.containsKey(functionName)) {
			// Get the actual function name from captured variables
			String actualFunctionName = capturedVariables.get(functionName);
			// Reconstruct the function call with the actual function name
			String substitutedExpr = actualFunctionName + "(" + argsString + ")";
			// Now parse the substituted expression
			return parseFunctionCall(substitutedExpr, functionRegistry, capturedVariables);
		}

		FunctionDef functionDef = functionRegistry.get(functionName);
		if (functionDef == null) {
			return Result.err(
					new CompileError("Function '" + functionName + "' is not defined"));
		}

		// Parse arguments
		Result<List<String>, CompileError> argsResult = parseArguments(argsString);
		if (argsResult instanceof Result.Err<List<String>, CompileError>) {
			return Result.err(((Result.Err<List<String>, CompileError>) argsResult).error());
		}
		List<String> args = ((Result.Ok<List<String>, CompileError>) argsResult).value();

		// Check argument count matches parameter count
		if (args.size() != functionDef.params().size()) {
			return Result.err(new CompileError(
					"Function '" + functionName + "' expects " + functionDef.params().size() + " arguments, but got " +
							args.size()));
		}

		// Substitute captured variables first (outer scope bindings)
		String result = functionDef.body();
		for (Map.Entry<String, String> captured : functionDef.capturedVariables().entrySet()) {
			String varName = captured.getKey();
			String varExpr = captured.getValue();
			// Replace variable references with their captured expressions
			result = result.replaceAll("\\b" + varName + "\\b", "(" + varExpr + ")");
		}

		// Then substitute parameters with arguments in the body
		for (int i = 0; i < functionDef.params().size(); i++) {
			String paramName = functionDef.params().get(i).name();
			String argValue = args.get(i);
			// Replace parameter references with argument values, using word boundaries
			result = result.replaceAll("\\b" + paramName + "\\b", "(" + argValue + ")");
		}

		return Result.ok(result);
	}

	private static Result<List<String>, CompileError> parseArguments(String argsString) {
		return FunctionDefinitionProcessor.splitByCommaAtDepthZero(argsString);
	}

	private static FunctionCallMatch parseFunctionCallPattern(String expr) {
		// Use depth-aware parsing instead of greedy regex to handle expressions like
		// "a() + b()"
		expr = expr.trim();

		// Check if it matches function call pattern: name(...)
		Pattern namePattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(");
		Matcher nameMatcher = namePattern.matcher(expr);
		if (!nameMatcher.find()) {
			return null;
		}

		String functionName = nameMatcher.group(1);
		int openParen = nameMatcher.end() - 1;

		// Find matching closing parenthesis using depth-aware parsing
		int closeParen = FunctionDefinitionProcessor.findMatchingParen(expr, openParen);
		if (closeParen == -1) {
			return null; // Unmatched parentheses
		}

		// Verify there's nothing after the closing parenthesis (except whitespace)
		String afterParen = expr.substring(closeParen + 1).trim();
		if (!afterParen.isEmpty()) {
			return null; // Not a simple function call
		}

		String argsString = expr.substring(openParen + 1, closeParen).trim();
		return new FunctionCallMatch(functionName, argsString);
	}

	/**
	 * Try to parse a function call with field access (e.g., get(100).value)
	 * Returns null if not a match, otherwise parses and returns the field value
	 */
	public static io.github.sirmathhman.tuff.Result<io.github.sirmathhman.tuff.compiler.ExpressionModel.ExpressionResult, io.github.sirmathhman.tuff.CompileError> tryParseFunctionCallWithFieldAccess(
			String expr, Map<String, FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		java.util.regex.Pattern pattern = java.util.regex.Pattern
				.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(([^)]*)\\)\\.([a-zA-Z_][a-zA-Z0-9_]*)(.*)$");
		java.util.regex.Matcher matcher = pattern.matcher(expr);
		if (!matcher.matches()) {
			return null;
		}

		String funcName = matcher.group(1);
		String funcArgs = matcher.group(2);
		String fieldName = matcher.group(3);
		String remaining = matcher.group(4);

		// Check if the function exists and returns 'this'
		if (!functionRegistry.containsKey(funcName)) {
			return null;
		}

		FunctionDef funcDef = functionRegistry.get(funcName);
		String funcBody = funcDef.body().trim();

		// If function body is 'this', parameters become accessible as fields
		if (!funcBody.equals("this")) {
			return null;
		}

		// Find the parameter with the matching name
		for (FunctionParam param : funcDef.params()) {
			if (param.name().equals(fieldName)) {
				List<String> args = parseFunctionArgumentsList(funcArgs);
				int paramIndex = funcDef.params().indexOf(param);
				if (paramIndex >= 0 && paramIndex < args.size()) {
					String argValue = args.get(paramIndex);
					String fullExpr = remaining.isEmpty() ? argValue : argValue + remaining;
					return io.github.sirmathhman.tuff.App.parseExpressionWithRead(fullExpr, functionRegistry, capturedVariables);
				}
			}
		}
		return null;
	}

	private static List<String> parseFunctionArgumentsList(String argsString) {
		List<String> args = new ArrayList<>();
		if (argsString == null || argsString.trim().isEmpty()) {
			return args;
		}

		StringBuilder current = new StringBuilder();
		int depth = 0;
		for (char c : argsString.toCharArray()) {
			if (c == '(' || c == '{' || c == '<') {
				depth++;
				current.append(c);
			} else if (c == ')' || c == '}' || c == '>') {
				depth--;
				current.append(c);
			} else if (c == ',' && depth == 0) {
				args.add(current.toString().trim());
				current = new StringBuilder();
			} else {
				current.append(c);
			}
		}
		if (current.length() > 0) {
			args.add(current.toString().trim());
		}
		return args;
	}

	private static record FunctionCallMatch(String functionName, String argsString) {
	}
}
