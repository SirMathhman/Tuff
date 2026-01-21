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

		Result<FunctionDefParts, CompileError> partsResult = splitFunctionDefinition(stmt);
		if (partsResult instanceof Result.Err<FunctionDefParts, CompileError> err) {
			return Result.err(err.error());
		}
		FunctionDefParts parts = ((Result.Ok<FunctionDefParts, CompileError>) partsResult).value();
		String name = parts.name();
		String paramString = parts.params();
		String returnType = parts.returnType();
		String body = preprocessFunctionBody(parts.body());
		String remaining = parts.remaining();

		// Parse parameters
		Result<List<FunctionParam>, CompileError> paramsResult = parseParameters(paramString);
		if (paramsResult instanceof Result.Err<List<FunctionParam>, CompileError>) {
			return Result.err(((Result.Err<List<FunctionParam>, CompileError>) paramsResult).error());
		}
		List<FunctionParam> params = ((Result.Ok<List<FunctionParam>, CompileError>) paramsResult).value();

		// If return type not specified, try to infer it from the body
		if (returnType == null) {
			Result<String, CompileError> inferredType = inferReturnType(body);
			if (inferredType instanceof Result.Err<String, CompileError>) {
				return Result.err(((Result.Err<String, CompileError>) inferredType).error());
			}
			returnType = ((Result.Ok<String, CompileError>) inferredType).value();
		} else {
			// Validate return type
			if (!isValidReturnType(returnType)) {
				return Result.err(new CompileError(
						"Invalid return type: " + returnType + ". Expected a valid type (I32, U8, U16, U32, I8, I16, Bool)"));
			}
		}

		return Result.ok(new ParsedFunction(
				new FunctionDef(name, params, returnType, body, capturedVariables), remaining));
	}

	private record FunctionDefParts(String name, String params, String returnType, String body, String remaining) {
	}

	private static Result<FunctionDefParts, CompileError> splitFunctionDefinition(String stmt) {
		// Format: fn name(params) [: ReturnType] => body; remaining
		String s = stmt.trim();
		if (!s.startsWith("fn ")) {
			return Result.err(new CompileError("Invalid function definition. Expected: fn name(params) => body;"));
		}

		int nameStart = 3;
		int parenOpen = s.indexOf('(', nameStart);
		if (parenOpen == -1) {
			return Result.err(new CompileError("Invalid function definition: missing '(' after function name"));
		}
		String name = s.substring(nameStart, parenOpen).trim();
		if (!name.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
			return Result.err(new CompileError("Invalid function name: " + name));
		}

		int parenClose = findMatchingParen(s, parenOpen);
		if (parenClose == -1) {
			return Result.err(new CompileError("Invalid function definition: unmatched ')' in parameter list"));
		}
		String params = s.substring(parenOpen + 1, parenClose).trim();

		int arrowIndex = s.indexOf("=>", parenClose + 1);
		if (arrowIndex == -1) {
			return Result.err(new CompileError("Invalid function definition: missing '=>'"));
		}

		String between = s.substring(parenClose + 1, arrowIndex).trim();
		String returnType = null;
		if (!between.isEmpty()) {
			if (!between.startsWith(":")) {
				return Result.err(new CompileError(
						"Invalid function definition. Expected ': ReturnType' before '=>'"));
			}
			returnType = between.substring(1).trim();
			if (returnType.isEmpty()) {
				return Result.err(new CompileError("Invalid function definition: missing return type after ':'"));
			}
		}

		int bodyStart = arrowIndex + 2;
		while (bodyStart < s.length() && Character.isWhitespace(s.charAt(bodyStart))) {
			bodyStart++;
		}
		int semiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(s, bodyStart);
		if (semiIndex == -1) {
			return Result.err(new CompileError("Invalid function definition: missing ';' terminator"));
		}
		String body = s.substring(bodyStart, semiIndex).trim();
		String remaining = s.substring(semiIndex + 1).trim();
		return Result.ok(new FunctionDefParts(name, params, returnType, body, remaining));
	}

	static int findMatchingParen(String s, int openIdx) {
		int depth = 1;
		for (int i = openIdx + 1; i < s.length(); i++) {
			char c = s.charAt(i);
			if (c == '(') {
				depth++;
			} else if (c == ')') {
				depth--;
				if (depth == 0) {
					return i;
				}
			}
		}
		return -1;
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

	private static Result<List<FunctionParam>, CompileError> parseParameters(String paramString) {
		List<FunctionParam> params = new ArrayList<>();

		if (paramString.isEmpty()) {
			return Result.ok(params);
		}

		// Split by comma at depth 0
		List<String> paramParts = new ArrayList<>();
		StringBuilder current = new StringBuilder();
		int depth = 0;

		for (char c : paramString.toCharArray()) {
			if (c == '<' || c == '(') {
				depth++;
				current.append(c);
			} else if (c == '>' || c == ')') {
				depth--;
				current.append(c);
			} else if (c == ',' && depth == 0) {
				paramParts.add(current.toString().trim());
				current = new StringBuilder();
			} else {
				current.append(c);
			}
		}

		if (current.length() > 0) {
			paramParts.add(current.toString().trim());
		}

		// Parse each parameter: name : Type
		for (String part : paramParts) {
			Pattern pattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*:\\s*([A-Za-z_*][A-Za-z0-9_*]*)$");
			Matcher matcher = pattern.matcher(part);

			if (!matcher.matches()) {
				return Result.err(
						new CompileError("Invalid parameter syntax: '" + part + "'. Expected: paramName : Type"));
			}

			String paramName = matcher.group(1);
			String paramType = matcher.group(2);

			// Validate parameter type
			if (!isValidReturnType(paramType)) {
				return Result.err(new CompileError(
						"Invalid parameter type: " + paramType + ". Expected a valid type (I32, U8, U16, U32, I8, I16, Bool)"));
			}

			params.add(new FunctionParam(paramName, paramType));
		}

		return Result.ok(params);
	}

	private static boolean isValidReturnType(String type) {
		return type.matches("^(U8|U16|U32|I8|I16|I32|Bool)$");
	}

	private static Result<String, CompileError> inferReturnType(String body) {
		body = body.trim();
		// Try to infer the return type from the body expression
		// This is a simplified inference that looks for type literals or read
		// operations

		// First, check if the body starts with a struct instantiation
		// (e.g., Point { ... })
		Pattern structPattern = Pattern.compile("^([A-Z][a-zA-Z0-9_]*)\\s*\\{");
		Matcher structMatcher = structPattern.matcher(body);
		if (structMatcher.find()) {
			String structType = structMatcher.group(1);
			return Result.ok(structType);
		}

		if (body.contains("read")) {
			// Try to extract type from read operation
			Pattern pattern = Pattern.compile("\\bread\\s+([A-Za-z_*][A-Za-z0-9_*]*)");
			Matcher matcher = pattern.matcher(body);
			if (matcher.find()) {
				String type = matcher.group(1);
				if (isValidReturnType(type)) {
					return Result.ok(type);
				}
			}
		}
		// Check for typed literals (e.g., 42U8, 100U16)
		if (body.matches(".*\\d+[UI]\\d+.*")) {
			Pattern pattern = Pattern.compile("\\d+([UI]\\d+)");
			Matcher matcher = pattern.matcher(body);
			if (matcher.find()) {
				String typeCode = matcher.group(1);
				// Convert U8 to U8, U16 to U16, etc.
				String fullType = typeCode;
				if (isValidReturnType(fullType)) {
					return Result.ok(fullType);
				}
			}
		}
		// Default to I32 if no type can be inferred
		return Result.ok("I32");
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

	/**
	 * Parse a function call and return the body expression with arguments
	 * substituted
	 */
	public static Result<String, CompileError> parseFunctionCall(String expr,
			Map<String, FunctionDef> functionRegistry) {
		expr = expr.trim();
		FunctionCallMatch match = parseFunctionCallPattern(expr);

		if (match == null) {
			return Result.err(new CompileError("Invalid function call syntax"));
		}

		String functionName = match.functionName;
		String argsString = match.argsString;

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
		List<String> args = new ArrayList<>();

		if (argsString.isEmpty()) {
			return Result.ok(args);
		}

		// Split by comma at depth 0, handling nested parentheses and angle brackets
		List<String> argParts = new ArrayList<>();
		StringBuilder current = new StringBuilder();
		int depth = 0;

		for (char c : argsString.toCharArray()) {
			if (c == '<' || c == '(' || c == '{') {
				depth++;
				current.append(c);
			} else if (c == '>' || c == ')' || c == '}') {
				depth--;
				current.append(c);
			} else if (c == ',' && depth == 0) {
				argParts.add(current.toString().trim());
				current = new StringBuilder();
			} else {
				current.append(c);
			}
		}

		if (current.length() > 0) {
			argParts.add(current.toString().trim());
		}

		return Result.ok(argParts);
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
		int closeParen = findMatchingParen(expr, openParen);
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
