package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.lib.ArrayList;

import java.util.regex.Pattern;

/**
 * Processor for function definition parsing. Extracted from
 * FunctionHandler.java
 * for size management.
 */
public final class FunctionDefinitionProcessor {
	private FunctionDefinitionProcessor() {
	}

	private record BodyAndRemaining(String body, String remaining) {
	}

	public record FunctionDefParts(String name, String params, String returnType, String body, String remaining) {
	}

	public static Result<FunctionDefParts, CompileError> splitFunctionDefinition(String stmt) {
		// Format: fn name(params) [: ReturnType] => body; remaining
		var s = stmt.trim();
		if (!s.startsWith("fn ")) {
			return Result.err(new CompileError("Invalid function definition. Expected: fn name(params) => body;"));
		}

		var nameStart = 3;
		var parenOpen = s.indexOf('(', nameStart);
		if (parenOpen == -1) {
			return Result.err(new CompileError("Invalid function definition: missing '(' after function name"));
		}
		var name = s.substring(nameStart, parenOpen).trim();
		if (!name.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
			return Result.err(new CompileError("Invalid function name: " + name));
		}

		var parenClose = findMatchingParen(s, parenOpen);
		if (parenClose == -1) {
			return Result.err(new CompileError("Invalid function definition: unmatched ')' in parameter list"));
		}
		var params = s.substring(parenOpen + 1, parenClose).trim();

		var arrowIndex = s.indexOf("=>", parenClose + 1);
		if (arrowIndex == -1) {
			return Result.err(new CompileError("Invalid function definition: missing '=>'"));
		}

		var between = s.substring(parenClose + 1, arrowIndex).trim();
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

		var bodyStart = arrowIndex + 2;
		while (bodyStart < s.length() && Character.isWhitespace(s.charAt(bodyStart))) {
			bodyStart++;
		}

		var resolvedReturnType = returnType;
		var bodyResult = parseBodyAndRemaining(s, bodyStart);
		return bodyResult.map(br -> new FunctionDefParts(name, params, resolvedReturnType, br.body(), br.remaining()));
	}

	private static Result<BodyAndRemaining, CompileError> parseBodyAndRemaining(String s, int bodyStart) {
		var semiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(s, bodyStart);
		if (semiIndex != -1) {
			var body = s.substring(bodyStart, semiIndex).trim();
			var remaining = s.substring(semiIndex + 1).trim();
			return Result.ok(new BodyAndRemaining(body, remaining));
		}

		// Allow omitting ';' terminator for block bodies: fn f() => { ... } nextExpr
		if (bodyStart < s.length() && s.charAt(bodyStart) == '{') {
			var closeBrace = DepthAwareSplitter.findMatchingBrace(s, bodyStart);
			if (closeBrace == -1) {
				return Result.err(new CompileError("Invalid function definition: unmatched '}' in body"));
			}
			var body = s.substring(bodyStart, closeBrace + 1).trim();
			var remaining = s.substring(closeBrace + 1).trim();
			return Result.ok(new BodyAndRemaining(body, remaining));
		}

		// If there's no semicolon and no block, treat the entire rest as body with
		// empty remaining
		// This supports: let func = fn get() => 100; func()
		var body = s.substring(bodyStart).trim();
		return Result.ok(new BodyAndRemaining(body, ""));
	}

	static int findMatchingParen(String s, int openIdx) {
		var depth = 1;
		for (var i = openIdx + 1; i < s.length(); i++) {
			var c = s.charAt(i);
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

	public static Result<ArrayList<String>, CompileError> splitByCommaAtDepthZero(String input) {
		ArrayList<String> parts = new ArrayList<>();

		if (input.isEmpty()) {
			return Result.ok(parts);
		}

		// Split by comma at depth 0, handling nested parentheses and angle brackets
		var current = new StringBuilder();
		var depth = 0;

		for (var c : input.toCharArray()) {
			if (c == '<' || c == '(' || c == '{') {
				depth++;
				current.append(c);
			} else if (c == '>' || c == ')' || c == '}') {
				depth--;
				current.append(c);
			} else if (c == ',' && depth == 0) {
				parts.add(current.toString().trim());
				current = new StringBuilder();
			} else {
				current.append(c);
			}
		}

		if (current.length() > 0) {
			parts.add(current.toString().trim());
		}

		return Result.ok(parts);
	}

	public static Result<ArrayList<FunctionHandler.FunctionParam>, CompileError> parseParameters(String paramString) {
		ArrayList<FunctionHandler.FunctionParam> params = new ArrayList<>();

		if (paramString.isEmpty() || paramString.isBlank()) {
			return Result.ok(params);
		}

		// Split by comma at depth 0
		var splitResult = splitByCommaAtDepthZero(paramString);
		if (splitResult instanceof Result.Err<ArrayList<String>, CompileError>) {
			return Result.err(((Result.Err<ArrayList<String>, CompileError>) splitResult).error());
		}
		var paramParts = ((Result.Ok<ArrayList<String>, CompileError>) splitResult).value();

		// Parse each parameter
		for (var paramPart : paramParts) {
			var parts = paramPart.split(":");
			if (parts.length != 2) {
				return Result.err(new CompileError("Invalid parameter syntax: expected 'name : type' but got '" + paramPart
						+ "'. All parameters must be explicitly typed."));
			}

			var paramName = parts[0].trim();
			var paramType = parts[1].trim();

			if (!paramName.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
				return Result
						.err(new CompileError("Invalid parameter name: '" + paramName + "' is not a valid identifier"));
			}

			if (!isValidParameterType(paramType)) {
				return Result.err(
						new CompileError("Invalid parameter type: '" + paramType + "' is not a valid type"));
			}

			params.add(new FunctionHandler.FunctionParam(paramName, paramType));
		}

		return Result.ok(params);
	}

	private static boolean isValidParameterType(String type) {
		return type
				.matches("([UI]\\d+|I32|Bool|Char|Str|\\*Str|\\*[a-zA-Z_][a-zA-Z0-9_]*|\\*mut\\s+[a-zA-Z_][a-zA-Z0-9_]*)");
	}

	public static Result<String, CompileError> inferReturnType(String body) {
		body = body.trim();
		// Try to infer the return type from the body expression
		// This is a simplified inference that looks for type literals or read
		// operations

		// First, check if the body starts with a struct instantiation
		// (e.g., Point { ... })
		var structPattern = Pattern.compile("^([A-Z][a-zA-Z0-9_]*)\\s*\\{");
		var structMatcher = structPattern.matcher(body);
		if (structMatcher.find()) {
			var structType = structMatcher.group(1);
			return Result.ok(structType);
		}

		if (body.contains("read")) {
			// Try to extract type from read operation
			var pattern = Pattern.compile("\\bread\\s+([A-Za-z_*][A-Za-z0-9_*]*)");
			var matcher = pattern.matcher(body);
			if (matcher.find()) {
				var type = matcher.group(1);
				if (isValidReturnType(type)) {
					return Result.ok(type);
				}
			}
		}
		// Check for typed literals (e.g., 42U8, 100U16)
		if (body.matches(".*\\d+[UI]\\d+.*")) {
			var pattern = Pattern.compile("\\d+([UI]\\d+)");
			var matcher = pattern.matcher(body);
			if (matcher.find()) {
				// Convert U8 to U8, U16 to U16, etc.
				if (isValidReturnType(matcher.group(1))) {
					return Result.ok(matcher.group(1));
				}
			}
		}
		// Default to I32 if no type can be inferred
		return Result.ok("I32");
	}

	private static boolean isValidReturnType(String type) {
		return type
				.matches(
						"([UI]\\d+|I32|Bool|Char|Str|\\*Str|[A-Z][a-zA-Z0-9_]*|\\*[a-zA-Z_][a-zA-Z0-9_]*|\\*mut\\s+[a-zA-Z_][a-zA-Z0-9_]*)");
	}

	/**
	 * Process a function definition by storing it in the registry and continuing
	 * with remaining code
	 */
	public static Result<ParsedFunctionStatement, CompileError> processFunctionDefinition(
			String stmt,
			java.util.Map<String, FunctionHandler.FunctionDef> functionRegistry) {
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

	/**
	 * Helper method to parse and extract arguments from a string, with error
	 * handling
	 */
	public static Result<ArrayList<String>, CompileError> parseAndExtractArguments(String argsString) {
		var argsResult = splitByCommaAtDepthZero(argsString);
		if (argsResult instanceof Result.Err<ArrayList<String>, CompileError>) {
			return Result.err(((Result.Err<ArrayList<String>, CompileError>) argsResult).error());
		}
		return Result.ok(((Result.Ok<ArrayList<String>, CompileError>) argsResult).value());
	}

	/**
	 * Helper to unwrap Result<T, CompileError> to either return ok value or error
	 */
	public static <T> Result<T, CompileError> unwrapResultInline(Result<T, CompileError> result) {
		if (result instanceof Result.Err<T, CompileError> err) {
			return Result.err(err.error());
		}
		return Result.ok(((Result.Ok<T, CompileError>) result).value());
	}
}
