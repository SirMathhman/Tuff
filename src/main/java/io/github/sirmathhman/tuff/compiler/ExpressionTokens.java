package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.ArrayList;
import java.util.List;

public final class ExpressionTokens {
	private ExpressionTokens() {
	}

	public static record LetBindingDecl(String varName, String declaredType, String valueExpr) {
	}

	public static Result<LetBindingDecl, CompileError> parseLetDeclaration(String expr) {
		var equalsIndex = expr.indexOf('=');
		if (equalsIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing '='"));
		}

		var semiIndex = expr.indexOf(';', equalsIndex);
		if (semiIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing ';'"));
		}

		var decl = expr.substring(4, equalsIndex).trim(); // Skip "let "
		String varName;
		String declaredType;

		// Check if type annotation is present (contains ':')
		if (decl.contains(":")) {
			// Find the first ':' at depth 0 (not inside parentheses)
			var colonIndex = findFirstColonAtDepthZero(decl);
			if (colonIndex == -1) {
				return Result.err(new CompileError("Invalid let binding: expected 'varName : type'"));
			}
			varName = decl.substring(0, colonIndex).trim();
			declaredType = decl.substring(colonIndex + 1).trim();
		} else {
			// No type annotation - will be inferred
			varName = decl.trim();
			declaredType = null;
		}

		var valueExpr = expr.substring(equalsIndex + 1, semiIndex).trim();

		return Result.ok(new LetBindingDecl(varName, declaredType, valueExpr));
	}

	public static int findFirstColonAtDepthZero(String s) {
		var depth = 0;
		for (var i = 0; i < s.length(); i++) {
			var c = s.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ':' && depth == 0) {
				return i;
			}
		}
		return -1;
	}

	public static Result<String, CompileError> extractTypeFromExpression(String expr) {
		return extractTypeFromExpression(expr, new java.util.HashMap<>());
	}

	public static Result<String, CompileError> extractTypeFromExpression(String expr,
			java.util.Map<String, String> variableTypes) {
		expr = expr.trim();

		// Handle this keyword - captures current scope as This type
		if ("this".equals(expr)) {
			return Result.ok("This");
		}

		// Handle boolean keywords
		if ("true".equals(expr) || "false".equals(expr)) {
			return Result.ok("Bool");
		}

		// Handle array types: [Type; InitCount; TotalCount]
		var arrayResult = tryParseArrayType(expr);
		if (arrayResult instanceof Result.Ok<String, CompileError>) {
			return arrayResult;
		}

		// Handle tuple expressions: (expr1, expr2, ...)
		if (expr.startsWith("(") && expr.endsWith(")")) {
			var inner = expr.substring(1, expr.length() - 1).trim();

			// Check if there are commas at depth 0 (indicating a tuple)
			var elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ',');
			if (elements.size() > 1) {
				// It's a tuple - extract types of all elements
				java.util.List<String> elementTypes = new java.util.ArrayList<>();
				for (var element : elements) {
					var elemTypeResult = extractTypeFromExpression(element.trim(),
							variableTypes);
					if (elemTypeResult instanceof Result.Err<String, CompileError>) {
						return elemTypeResult;
					}
					elementTypes.add(((Result.Ok<String, CompileError>) elemTypeResult).value());
				}
				// Return tuple type as (Type1, Type2, ...)
				return Result.ok("(" + String.join(", ", elementTypes) + ")");
			}
		}

		// Handle function types: () => ReturnType or (ParamType, ...) => ReturnType
		if (expr.contains("=>")) {
			return Result.ok(expr);
		}

		// Handle dereference operations
		if (expr.startsWith("*")) {
			return extractDereferenceType(expr, variableTypes);
		}

		// Handle reference operations (including &mut)
		if (expr.startsWith("&")) {
			return extractReferenceType(expr, variableTypes);
		}

		// Handle variable references
		if (variableTypes.containsKey(expr)) {
			return Result.ok(variableTypes.get(expr));
		}

		// Handle read operations
		if (expr.startsWith("read ")) {
			var typeSpec = expr.substring(5).trim();
			if (!typeSpec.matches("\\*?([a-zA-Z_][a-zA-Z0-9_]*|[UI]\\d+|Bool|Char)")) {
				return Result.err(new CompileError("Invalid type specification: " + typeSpec));
			}
			return Result.ok(typeSpec);
		}

		// For now, return error for unknown variables/complex expressions
		// This will be handled as an error at a higher level
		return Result.err(new CompileError("Cannot infer type for expression: " + expr));
	}

	private static Result<String, CompileError> extractDereferenceType(String expr,
			java.util.Map<String, String> variableTypes) {
		var inner = expr.substring(1).trim();
		var innerType = extractTypeFromExpression(inner, variableTypes);
		if (innerType instanceof Result.Err<String, CompileError>) {
			return innerType;
		}
		if (!(innerType instanceof Result.Ok<String, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in inner dereference type"));
		}
		var pointerType = ok.value();
		// Strip 'mut' keyword if present: *mut Type -> *Type
		if (pointerType.startsWith("*mut ")) {
			pointerType = "*" + pointerType.substring(5);
		}
		// Dereferencing *Type should give Type
		if (pointerType.startsWith("*")) {
			return Result.ok(pointerType.substring(1));
		}
		return Result.err(new CompileError("Cannot dereference non-pointer type: " + pointerType));
	}

	private static Result<String, CompileError> extractReferenceType(String expr,
			java.util.Map<String, String> variableTypes) {
		var inner = expr.substring(1).trim();
		// Strip 'mut' keyword if present: &mut x -> &x
		if (inner.startsWith("mut ")) {
			inner = inner.substring(4).trim();
		}
		var innerType = extractTypeFromExpression(inner, variableTypes);
		if (innerType instanceof Result.Ok<String, CompileError> ok) {
			// Taking reference of Type gives *Type (or *mut Type for mutable references)
			return Result.ok("*" + ok.value());
		}
		// If we can't determine the type of the inner expression, return generic
		// pointer type
		return Result.ok("*U8");
	}

	public static List<String> splitTokensByOperators(String expr, boolean isAdditive) {
		List<String> result = new ArrayList<>();
		var token = new StringBuilder();
		var depth = 0;

		for (var i = 0; i < expr.length(); i++) {
			var c = expr.charAt(i);
			boolean isOp;
			if (isAdditive)
				isOp = c == '+' || c == '-';
			else
				isOp = c == '*';

			// For * and & operators, check if they're unary (not binary)
			// They're unary if they appear at the start or after another operator
			if (!isAdditive && c == '*' && i == 0) {
				isOp = false; // Leading * is dereference, not multiplication
			}
			if (!isAdditive && c == '*' && i > 0) {
				// Check if previous non-whitespace character is an operator or delimiter
				var prevIdx = i - 1;
				while (prevIdx >= 0 && Character.isWhitespace(expr.charAt(prevIdx))) {
					prevIdx--;
				}
				if (prevIdx >= 0) {
					var prev = expr.charAt(prevIdx);
					if (prev == '(' || prev == '+' || prev == '-' || prev == '*' || prev == '/' || prev == '&') {
						isOp = false; // This * is unary (dereference or start of multiplication in parenthesized
													// group)
					}
				}
			}

			if (c == '(') {
				depth++;
				token.append(c);
			} else if (c == ')') {
				depth--;
				token.append(c);
			} else if (isOp && depth == 0 && (!isAdditive || token.length() > 0)) {
				var t = token.toString().trim();
				if (!t.isEmpty() || !isAdditive) {
					result.add(t);
				}
				token = new StringBuilder();
			} else {
				token.append(c);
			}
		}

		var t = token.toString().trim();
		if (!t.isEmpty() || !isAdditive) {
			result.add(t);
		}
		return result;
	}

	public static List<String> splitAddOperators(String expr) {
		return splitTokensByOperators(expr, true);
	}

	/**
	 * Check if sourceType can be implicitly upcast to targetType.
	 * <p>
	 * Upcasting rules:
	 * - Same type: always compatible
	 * - U8 can upcast to U16, U32
	 * - U16 can upcast to U32
	 * - I8 can upcast to I16, I32
	 * - I16 can upcast to I32
	 * - Downcast or cross-sign conversions are not allowed
	 * - Pointer types must match exactly
	 * - This type matches only This
	 */
	public static boolean isTypeCompatible(String sourceType, String targetType) {
		if (sourceType.equals(targetType)) {
			return true;
		}

		// Handle tuple types - must match exactly
		if (sourceType.startsWith("(") && sourceType.endsWith(")") ||
				targetType.startsWith("(") && targetType.endsWith(")")) {
			return false;
		}

		// Handle function types - must match exactly
		if (sourceType.contains("=>") || targetType.contains("=>")) {
			return false;
		}

		// Handle This type - must match exactly
		if ("This".equals(sourceType) || "This".equals(targetType)) {
			return false;
		}

		// Strip 'mut' keyword for comparison: *mut Type -> *Type
		var sourceNorm = sourceType.replaceAll("\\*mut\\s+", "*");
		var targetNorm = targetType.replaceAll("\\*mut\\s+", "*");
		if (sourceNorm.equals(targetNorm)) {
			return true;
		}

		// Pointer types must match exactly
		var sourceIsPointer = sourceNorm.startsWith("*");
		var targetIsPointer = targetNorm.startsWith("*");
		if (sourceIsPointer != targetIsPointer) {
			return false;
		}

		// If both are pointers, recurse on the pointed-to types
		if (sourceIsPointer) {
			return isTypeCompatible(sourceNorm.substring(1), targetNorm.substring(1));
		}

		// Parse type name and bit width
		if (!sourceType.matches("[UI]\\d+") || !targetType.matches("[UI]\\d+")) {
			return false;
		}

		var sourceSign = sourceType.charAt(0);
		var targetSign = targetType.charAt(0);
		var sourceWidth = Integer.parseInt(sourceType.substring(1));
		var targetWidth = Integer.parseInt(targetType.substring(1));

		// Cross-sign conversion not allowed (U -> I or I -> U)
		if (sourceSign != targetSign) {
			return false;
		}

		// Can only upcast to same sign with larger or equal width
		return targetWidth >= sourceWidth;
	}

	public static Result<Long, CompileError> parseLiteral(String literal) {
		try {
			if ("true".equals(literal)) {
				return Result.ok(1L);
			}
			if ("false".equals(literal)) {
				return Result.ok(0L);
			}

			// Handle string indexing: "string"[index]
			if (literal.contains("\"") && literal.contains("[")) {
				var stringIndexResult = io.github.sirmathhman.tuff.compiler.strings.StringIndexingHandler
						.parseStringIndexing(literal);
				if (stringIndexResult instanceof Result.Ok<Long, CompileError>) {
					return stringIndexResult;
				}
				// If it fails, fall through to other parsing attempts
			}

			// Handle char literals: 'a', '\n', '\0', etc.
			if (literal.startsWith("'") && literal.endsWith("'")) {
				return parseCharLiteral(literal);
			}

			var numericPart = literal;
			String typeSuffix = null;

			if (literal.matches(".*Bool$")) {
				typeSuffix = "Bool";
				numericPart = literal.replaceAll("Bool$", "");
			} else if (literal.matches(".*[UI]\\d+$")) {
				typeSuffix = literal.replaceAll("^.*([UI]\\d+)$", "$1");
				numericPart = literal.replaceAll("[UI]\\d+$", "");
			}

			var value = Long.parseLong(numericPart);

			if (typeSuffix != null) {
				var typeCheck = validateTypeSuffix(typeSuffix, value, literal);
				if (typeCheck instanceof Result.Err<Void, CompileError> err) {
					return Result.err(err.error());
				}
			}

			return Result.ok(value);
		} catch (NumberFormatException e) {
			return Result.err(new CompileError("Failed to parse numeric value: " + literal));
		}
	}

	private static Result<Void, CompileError> validateTypeSuffix(String typeSuffix, long value, String literal) {
		if ("Bool".equals(typeSuffix)) {
			if (value != 0 && value != 1) {
				return Result.err(new CompileError("Bool literal must be 0 or 1, got: " + literal));
			}
		} else {
			var isUnsigned = typeSuffix.startsWith("U");
			var bits = Integer.parseInt(typeSuffix.substring(1));

			if (isUnsigned) {
				if (value < 0) {
					return Result.err(new CompileError("Negative value not allowed for unsigned type: " + literal));
				}
				var maxValue = (1L << bits) - 1;
				if (value > maxValue) {
					return Result.err(new CompileError(
							"Value " + value + " exceeds maximum for " + typeSuffix + " (" + maxValue + "): " + literal));
				}
			} else {
				var minValue = -(1L << (bits - 1));
				var maxValue = (1L << (bits - 1)) - 1;
				if (value < minValue || value > maxValue) {
					return Result.err(new CompileError("Value " + value + " out of range for " + typeSuffix + " (" + minValue
							+ " to " + maxValue + "): " + literal));
				}
			}
		}
		return Result.ok(null);
	}

	private static Result<Long, CompileError> parseCharLiteral(String literal) {
		if (literal.length() < 3) {
			return Result.err(new CompileError("Invalid char literal: too short: " + literal));
		}
		var inner = literal.substring(1, literal.length() - 1);
		if (inner.startsWith("\\")) {
			if (inner.length() == 1) {
				return Result.err(new CompileError("Invalid escape sequence in char literal: " + literal));
			}
			var escapeChar = inner.charAt(1);
			long code = switch (escapeChar) {
				case '0' -> 0;
				case 'n' -> 10;
				case 't' -> 9;
				case 'r' -> 13;
				case '\\' -> 92;
				case '\'' -> 39;
				case '"' -> 34;
				default -> -1;
			};
			if (code == -1) {
				return Result.err(new CompileError("Invalid escape sequence in char literal: " + literal));
			}
			return Result.ok(code);
		}
		if (inner.length() == 1) {
			var c = inner.charAt(0);
			return Result.ok((long) c);
		}
		return Result
				.err(new CompileError("Invalid char literal: must be single character or escape sequence: " + literal));
	}

	/**
	 * Check if an expression is a tuple expression.
	 * A tuple expression starts with ( and ends with ), and contains at least one
	 * comma at depth 0.
	 */
	public static boolean isTupleExpression(String expr) {
		if (!expr.startsWith("(") || !expr.endsWith(")")) {
			return false;
		}
		var inner = expr.substring(1, expr.length() - 1);
		var elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ',');
		return elements.size() > 1;
	}

	/**
	 * Parse array type: [ElementType; InitializedCount; TotalCount]
	 * Returns the array type string in the format [Type; InitCount; TotalCount]
	 */
	private static Result<String, CompileError> tryParseArrayType(String expr) {
		if (!expr.startsWith("[") || !expr.endsWith("]")) {
			return Result.err(new CompileError("Invalid array type: must start with [ and end with ]"));
		}

		var inner = expr.substring(1, expr.length() - 1).trim();
		var parts = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ';');
		if (parts.size() != 3) {
			return Result.err(new CompileError("Invalid array type: expected [Type; InitCount; TotalCount], got " + expr));
		}

		var elementType = parts.get(0).trim();
		var initCountStr = parts.get(1).trim();
		var totalCountStr = parts.get(2).trim();

		var isValidElementType = isValidArrayElementType(elementType);
		if (!isValidElementType) {
			return Result.err(new CompileError("Invalid array element type: " + elementType));
		}

		try {
			var initCount = Integer.parseInt(initCountStr);
			var totalCount = Integer.parseInt(totalCountStr);
			if (initCount < 0 || totalCount < 0) {
				return Result.err(new CompileError("Array counts must be non-negative"));
			}
			if (initCount > totalCount) {
				return Result.err(new CompileError("Initialized count cannot exceed total count"));
			}
		} catch (NumberFormatException e) {
			return Result.err(new CompileError("Array counts must be numeric: " + e.getMessage()));
		}
		return Result.ok(expr);
	}

	private static boolean isValidArrayElementType(String type) {
		type = type.trim();
		// Primitive types
		if (type.matches("[UI]\\d+|Bool|Char")) {
			return true;
		}
		// Nested array type
		if (type.startsWith("[") && type.endsWith("]")) {
			var nestedResult = tryParseArrayType(type);
			return nestedResult instanceof Result.Ok<String, CompileError>;
		}
		return false;
	}
}
