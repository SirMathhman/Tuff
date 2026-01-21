package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
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

		String resolvedReturnType = returnType;
		Result<BodyAndRemaining, CompileError> bodyResult = parseBodyAndRemaining(s, bodyStart);
		return bodyResult.map(br -> new FunctionDefParts(name, params, resolvedReturnType, br.body(), br.remaining()));
	}

	private static Result<BodyAndRemaining, CompileError> parseBodyAndRemaining(String s, int bodyStart) {
		int semiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(s, bodyStart);
		if (semiIndex != -1) {
			String body = s.substring(bodyStart, semiIndex).trim();
			String remaining = s.substring(semiIndex + 1).trim();
			return Result.ok(new BodyAndRemaining(body, remaining));
		}

		// Allow omitting ';' terminator for block bodies: fn f() => { ... } nextExpr
		if (bodyStart < s.length() && s.charAt(bodyStart) == '{') {
			int closeBrace = DepthAwareSplitter.findMatchingBrace(s, bodyStart);
			if (closeBrace == -1) {
				return Result.err(new CompileError("Invalid function definition: unmatched '}' in body"));
			}
			String body = s.substring(bodyStart, closeBrace + 1).trim();
			String remaining = s.substring(closeBrace + 1).trim();
			return Result.ok(new BodyAndRemaining(body, remaining));
		}

		// If there's no semicolon and no block, treat the entire rest as body with
		// empty remaining
		// This supports: let func = fn get() => 100; func()
		String body = s.substring(bodyStart).trim();
		return Result.ok(new BodyAndRemaining(body, ""));
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

	public static Result<List<String>, CompileError> splitByCommaAtDepthZero(String input) {
		List<String> parts = new ArrayList<>();

		if (input.isEmpty()) {
			return Result.ok(parts);
		}

		// Split by comma at depth 0, handling nested parentheses and angle brackets
		StringBuilder current = new StringBuilder();
		int depth = 0;

		for (char c : input.toCharArray()) {
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

	public static Result<List<FunctionHandler.FunctionParam>, CompileError> parseParameters(String paramString) {
		List<FunctionHandler.FunctionParam> params = new ArrayList<>();

		if (paramString.isEmpty() || paramString.isBlank()) {
			return Result.ok(params);
		}

		// Split by comma at depth 0
		Result<List<String>, CompileError> splitResult = splitByCommaAtDepthZero(paramString);
		if (splitResult instanceof Result.Err<List<String>, CompileError>) {
			return Result.err(((Result.Err<List<String>, CompileError>) splitResult).error());
		}
		List<String> paramParts = ((Result.Ok<List<String>, CompileError>) splitResult).value();

		// Parse each parameter
		for (String paramPart : paramParts) {
			String[] parts = paramPart.split(":");
			if (parts.length != 2) {
				return Result.err(new CompileError("Invalid parameter syntax: expected 'name : type' but got '" + paramPart
						+ "'. All parameters must be explicitly typed."));
			}

			String paramName = parts[0].trim();
			String paramType = parts[1].trim();

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
		return type.matches("([UI]\\d+|I32|Bool|\\*[a-zA-Z_][a-zA-Z0-9_]*|\\*mut\\s+[a-zA-Z_][a-zA-Z0-9_]*)");
	}

	public static Result<String, CompileError> inferReturnType(String body) {
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

	private static boolean isValidReturnType(String type) {
		return type
				.matches("([UI]\\d+|I32|Bool|[A-Z][a-zA-Z0-9_]*|\\*[a-zA-Z_][a-zA-Z0-9_]*|\\*mut\\s+[a-zA-Z_][a-zA-Z0-9_]*)");
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
}
