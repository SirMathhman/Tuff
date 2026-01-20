package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

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
	 * Record for a parsed function definition with parameters
	 */
	public record FunctionDef(String name, List<FunctionParam> params, String returnType, String body) {
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
		stmt = stmt.trim();

		// Match: fn name(...) [: ReturnType] => body;
		// Return type is optional
		Pattern pattern = Pattern.compile(
				"^fn\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(([^)]*)\\)(?:\\s*:\\s*([A-Za-z_*][A-Za-z0-9_*]*))?\\s*=>\\s*(.+?)\\s*;(.*)$",
				Pattern.DOTALL);
		Matcher matcher = pattern.matcher(stmt);

		if (!matcher.matches()) {
			return Result.err(new CompileError(
					"Invalid function definition. Expected: fn name(params) [: ReturnType] => body;"));
		}

		String name = matcher.group(1);
		String paramString = matcher.group(2).trim();
		String returnType = matcher.group(3); // Can be null if not specified
		String body = matcher.group(4).trim();
		String remaining = matcher.group(5).trim();

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

		return Result.ok(new ParsedFunction(new FunctionDef(name, params, returnType, body), remaining));
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

		// Substitute parameters with arguments in the body
		String result = functionDef.body();
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
		Pattern pattern = Pattern.compile("^([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\((.*)\\)$", Pattern.DOTALL);
		Matcher matcher = pattern.matcher(expr);
		if (!matcher.matches()) {
			return null;
		}
		return new FunctionCallMatch(matcher.group(1), matcher.group(2).trim());
	}

	private static record FunctionCallMatch(String functionName, String argsString) {
	}
}
