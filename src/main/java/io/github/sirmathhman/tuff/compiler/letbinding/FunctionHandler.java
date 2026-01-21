package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;

import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;
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
			String name, ArrayList<FunctionParam> params, String returnType, String body,
			Map<String, String> capturedVariables) {
		public FunctionDef(String name, ArrayList<FunctionParam> params, String returnType, String body) {
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
		var s = stmt.trim();
		var partsResult = FunctionDefinitionProcessor.splitFunctionDefinition(s);
		if (partsResult instanceof Result.Err<FunctionDefinitionProcessor.FunctionDefParts, CompileError> err) {
			return Result.err(err.error());
		}
		var parts = ((Result.Ok<FunctionDefinitionProcessor.FunctionDefParts, CompileError>) partsResult)
				.value();
		var name = parts.name();
		var paramString = parts.params();
		var returnType = parts.returnType();
		var body = preprocessFunctionBody(parts.body());
		var remaining = parts.remaining();

		// Parse parameters
		var paramsResult = FunctionDefinitionProcessor
				.parseParameters(paramString);
		if (paramsResult instanceof Result.Err<ArrayList<FunctionParam>, CompileError>) {
			return Result.err(((Result.Err<ArrayList<FunctionParam>, CompileError>) paramsResult).error());
		}
		var params = ((Result.Ok<ArrayList<FunctionParam>, CompileError>) paramsResult).value();

		// If return type not specified, try to infer it from the body
		if (returnType == null) {
			var inferredType = FunctionDefinitionProcessor.inferReturnType(body);
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
		var closingBrace = DepthAwareSplitter.findMatchingBrace(body, 0);
		if (closingBrace == -1 || closingBrace <= 1) {
			return body;
		}
		var inner = body.substring(1, closingBrace).trim();
		var suffix = body.substring(closingBrace + 1).trim();
		var semiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(inner, 0);
		if (semiIdx == -1) {
			return body;
		}
		var firstStmt = inner.substring(0, semiIdx).trim();
		if (!firstStmt.startsWith("if (")) {
			return body;
		}
		var condEnd = ConditionalExpressionHandler.findConditionEnd(firstStmt);
		if (condEnd == -1) {
			return body;
		}
		var result = extractReturnOrYieldContent(firstStmt, condEnd);
		if (result == null) {
			return body;
		}
		var fallback = inner.substring(semiIdx + 1).trim();
		if (fallback.isEmpty()) {
			return body;
		}
		return buildDesugaredExpression(result, fallback, suffix);
	}

	private static class ReturnYieldResult {
		final String condition;
		final String valueExpr;
		final boolean isYield;

		ReturnYieldResult(String condition, String valueExpr, boolean isYield) {
			this.condition = condition;
			this.valueExpr = valueExpr;
			this.isYield = isYield;
		}
	}

	private static ReturnYieldResult extractReturnOrYieldContent(String firstStmt, int condEnd) {
		var condition = firstStmt.substring(4, condEnd).trim();
		var afterCond = firstStmt.substring(condEnd + 1).trim();
		var isYield = afterCond.startsWith("yield");
		var isReturn = afterCond.startsWith("return");
		if (!isYield && !isReturn) {
			return null;
		}
		var valueExpr = isYield ? afterCond.substring(5).trim() : afterCond.substring(6).trim();
		if (valueExpr.isEmpty()) {
			return null;
		}
		return new ReturnYieldResult(condition, valueExpr, isYield);
	}

	private static String buildDesugaredExpression(ReturnYieldResult result, String fallback, String suffix) {
		var suffixPart = suffix.isEmpty() ? "" : " " + suffix;
		if (result.isYield) {
			var blockValue = "if (" + result.condition + ") " + result.valueExpr + " else " + fallback;
			return "(" + blockValue + ")" + suffixPart;
		}
		var elseExpr = suffix.isEmpty() ? fallback : fallback + suffixPart;
		return "if (" + result.condition + ") " + result.valueExpr + " else (" + elseExpr + ")";
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
		var e = expr.trim();
		var match = parseFunctionCallPattern(e);
		return match != null && functionRegistry.containsKey(match.functionName);
	}

	public static boolean isFunctionCall(String expr, Map<String, FunctionDef> functionRegistry,
			Map<String, String> capturedVariables) {
		if (isFunctionCall(expr, functionRegistry)) {
			return true;
		}
		var e = expr.trim();
		var match = parseFunctionCallPattern(e);
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
		var e = expr.trim();
		var match = parseFunctionCallPattern(e);

		if (match == null) {
			return Result.err(new CompileError("Invalid function call syntax"));
		}

		var functionName = match.functionName;
		var argsString = match.argsString;

		// Check if this is a bound function reference
		if (capturedVariables.containsKey(functionName)) {
			// Get the actual function name from captured variables
			var actualFunctionName = capturedVariables.get(functionName);
			// Reconstruct the function call with the actual function name
			var substitutedExpr = actualFunctionName + "(" + argsString + ")";
			// Now parse the substituted expression
			return parseFunctionCall(substitutedExpr, functionRegistry, capturedVariables);
		}

		var functionDef = functionRegistry.get(functionName);
		if (functionDef == null) {
			return Result.err(
					new CompileError("Function '" + functionName + "' is not defined"));
		}

		// Parse arguments
		var argsResult = FunctionDefinitionProcessor
				.parseAndExtractArguments(argsString);
		if (argsResult instanceof Result.Err<ArrayList<String>, CompileError> err) {
			return Result.err(err.error());
		}
		var args = ((Result.Ok<ArrayList<String>, CompileError>) argsResult).value();

		// Check argument count matches parameter count
		if (args.size() != functionDef.params().size()) {
			return Result.err(new CompileError(
					"Function '" + functionName + "' expects " + functionDef.params().size() + " arguments, but got " +
							args.size()));
		}

		// Substitute captured variables first (outer scope bindings)
		var result = functionDef.body();
		for (var captured : functionDef.capturedVariables().entrySet()) {
			var varName = captured.getKey();
			var varExpr = captured.getValue();
			// Replace variable references with their captured expressions
			result = result.replaceAll("\\b" + varName + "\\b", "(" + varExpr + ")");
		}

		// Then substitute parameters with arguments in the body
		for (var i = 0; i < functionDef.params().size(); i++) {
			var paramName = functionDef.params().get(i).name();
			var argValue = args.get(i);
			// Replace parameter references with argument values, using word boundaries
			result = result.replaceAll("\\b" + paramName + "\\b", "(" + argValue + ")");
		}

		return Result.ok(result);
	}

	private static FunctionCallMatch parseFunctionCallPattern(String expr) {
		// Use depth-aware parsing instead of greedy regex to handle expressions like
		// "a() + b()"
		var e = expr.trim();

		// Check if it matches function call pattern: name(...)
		var namePattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(");
		var nameMatcher = namePattern.matcher(e);
		if (!nameMatcher.find()) {
			return null;
		}

		var functionName = nameMatcher.group(1);
		var openParen = nameMatcher.end() - 1;

		// Find matching closing parenthesis using depth-aware parsing
		var closeParen = FunctionDefinitionProcessor.findMatchingParen(e, openParen);
		if (closeParen == -1) {
			return null; // Unmatched parentheses
		}

		// Verify there's nothing after the closing parenthesis (except whitespace)
		var afterParen = e.substring(closeParen + 1).trim();
		if (!afterParen.isEmpty()) {
			return null; // Not a simple function call
		}

		var argsString = e.substring(openParen + 1, closeParen).trim();
		return new FunctionCallMatch(functionName, argsString);
	}

	/**
	 * Try to parse a function call with field access (e.g., get(100).value)
	 * Returns null if not a match, otherwise parses and returns the field value
	 */
	public static io.github.sirmathhman.tuff.Result<io.github.sirmathhman.tuff.compiler.ExpressionModel.ExpressionResult, io.github.sirmathhman.tuff.CompileError> tryParseFunctionCallWithFieldAccess(
			String expr, Map<String, FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		var pattern = java.util.regex.Pattern
				.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(([^)]*)\\)\\.([a-zA-Z_][a-zA-Z0-9_]*)(.*)$");
		var matcher = pattern.matcher(expr);
		if (!matcher.matches()) {
			return null;
		}

		var funcName = matcher.group(1);
		var funcArgs = matcher.group(2);
		var fieldName = matcher.group(3);
		var remaining = matcher.group(4);

		// Check if the function exists and returns 'this'
		if (!functionRegistry.containsKey(funcName)) {
			return null;
		}

		var funcDef = functionRegistry.get(funcName);
		var funcBody = funcDef.body().trim();

		// If function body is 'this', parameters become accessible as fields
		if (!funcBody.equals("this")) {
			return null;
		}

		// Find the parameter with the matching name
		for (var param : funcDef.params()) {
			if (param.name().equals(fieldName)) {
				var args = parseFunctionArgumentsList(funcArgs);
				var paramIndex = funcDef.params().indexOf(param);
				if (paramIndex >= 0 && paramIndex < args.size()) {
					var argValue = args.get(paramIndex);
					String fullExpr;
					if (remaining.isEmpty())
						fullExpr = argValue;
					else
						fullExpr = argValue + remaining;
					return io.github.sirmathhman.tuff.App.parseExpressionWithRead(fullExpr, functionRegistry, capturedVariables);
				}
			}
		}
		return null;
	}

	private static ArrayList<String> parseFunctionArgumentsList(String argsString) {
		ArrayList<String> args = new ArrayList<>();
		if (argsString == null || argsString.trim().isEmpty()) {
			return args;
		}

		var current = new StringBuilder();
		var depth = 0;
		for (var c : argsString.toCharArray()) {
			if (c == '(' || c == '{' || c == '<') {
				depth++;
				current.append(c);
			} else if (c == ')' || c == '}' || c == '>') {
				depth--;
				current.append(c);
			} else if (c == ',' && depth == 0) {
				args = args.add(current.toString().trim());
				current = new StringBuilder();
			} else {
				current.append(c);
			}
		}
		if (current.length() > 0) {
			args = args.add(current.toString().trim());
		}
		return args;
	}

	/**
	 * Transform method-style call to standard function call
	 * Example: "100.addOnce()" → "addOnce(100)"
	 * Validates that the function has "this" as first parameter
	 */
	public static Result<String, CompileError> transformMethodCall(
			String expr, Map<String, FunctionDef> functionRegistry,
			Map<String, String> capturedVariables) {
		var match = parseMethodCallPattern(expr);
		if (match == null) {
			return Result.err(new CompileError("Not a method-style call"));
		}

		var receiver = match.receiver;
		var functionName = match.functionName;
		var argsString = match.argsString;

		// Check if function exists
		var functionDef = functionRegistry.get(functionName);
		if (functionDef == null && !capturedVariables.containsKey(functionName)) {
			return Result.err(new CompileError("Function '" + functionName + "' is not defined"));
		}

		// If it's a captured function reference, resolve it
		if (functionDef == null) {
			var actualFunctionName = capturedVariables.get(functionName);
			functionDef = functionRegistry.get(actualFunctionName);
			if (functionDef == null) {
				return Result.err(new CompileError("Function '" + functionName + "' is not defined"));
			}
		}

		// Check that first parameter is "this"
		if (functionDef.params().isEmpty() || !functionDef.params().get(0).name().equals("this")) {
			return Result.err(new CompileError(
					"Method '" + functionName + "' must have 'this' as its first parameter"));
		}

		// Parse the arguments
		var argsResult = FunctionDefinitionProcessor.splitByCommaAtDepthZero(argsString);
		if (argsResult instanceof Result.Err<ArrayList<String>, CompileError> err) {
			return Result.err(err.error());
		}
		var args = ((Result.Ok<ArrayList<String>, CompileError>) argsResult).value();

		// Check argument count: params.size() - 1 (for 'this') should match args.size()
		var expectedArgCount = functionDef.params().size() - 1;
		if (args.size() != expectedArgCount) {
			return Result.err(new CompileError(
					"Function '" + functionName + "' expects " + expectedArgCount + " arguments (plus 'this'), but got " +
							args.size()));
		}

		// Build transformed call: functionName(receiver, arg1, arg2, ...)
		var transformedCall = new StringBuilder();
		transformedCall.append(functionName).append("(").append(receiver);
		for (var arg : args) {
			transformedCall.append(", ").append(arg);
		}
		transformedCall.append(")");

		return Result.ok(transformedCall.toString());
	}

	/**
	 * Try to parse a method-style call: receiver.functionName(args)
	 * Example: 100.addOnce() or x.increment()
	 * Returns a MethodCallMatch if it matches, or null otherwise
	 */
	private static MethodCallMatch parseMethodCallPattern(String expr) {
		var e = expr.trim();

		// Pattern: receiver.functionName(args)
		// Receiver can be: literal (100), identifier (x), or simple expression
		// We need to find the last dot followed by a function call
		var lastDotIndex = findLastDotBeforeFunctionCall(e);
		if (lastDotIndex == -1) {
			return null;
		}

		var receiver = e.substring(0, lastDotIndex).trim();
		var afterDot = e.substring(lastDotIndex + 1).trim();

		// Check if after the dot we have functionName(args)
		var funcPattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(");
		var funcMatcher = funcPattern.matcher(afterDot);
		if (!funcMatcher.find()) {
			return null;
		}

		var functionName = funcMatcher.group(1);
		var openParen = funcMatcher.end() - 1;

		// Find matching closing parenthesis
		var closeParen = FunctionDefinitionProcessor.findMatchingParen(afterDot, openParen);
		if (closeParen == -1) {
			return null;
		}

		// Verify nothing after the closing parenthesis
		var afterParen = afterDot.substring(closeParen + 1).trim();
		if (!afterParen.isEmpty()) {
			return null;
		}

		var argsString = afterDot.substring(openParen + 1, closeParen).trim();
		return new MethodCallMatch(receiver, functionName, argsString);
	}

	/**
	 * Find the last dot that precedes a function call pattern
	 * Avoid dots inside parentheses or nested expressions
	 */
	private static int findLastDotBeforeFunctionCall(String expr) {
		var depth = 0;
		for (var i = expr.length() - 1; i >= 0; i--) {
			var c = expr.charAt(i);
			if (c == ')' || c == '}') {
				depth++;
			} else if (c == '(' || c == '{') {
				depth--;
			} else if (c == '.' && depth == 0) {
				// Check if after this dot is a valid function pattern
				var afterDot = expr.substring(i + 1).trim();
				var funcPattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(");
				if (funcPattern.matcher(afterDot).find()) {
					return i;
				}
			}
		}
		return -1;
	}

	private static record FunctionCallMatch(String functionName, String argsString) {
	}

	private static record MethodCallMatch(String receiver, String functionName, String argsString) {
	}
}
