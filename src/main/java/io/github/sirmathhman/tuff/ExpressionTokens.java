package io.github.sirmathhman.tuff;

import java.util.ArrayList;
import java.util.List;

public final class ExpressionTokens {
	private ExpressionTokens() {
	}

	public static record LetBindingDecl(String varName, String declaredType, String valueExpr) {
	}

	public static Result<LetBindingDecl, CompileError> parseLetDeclaration(String expr) {
		int equalsIndex = expr.indexOf('=');
		if (equalsIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing '='"));
		}

		int semiIndex = expr.indexOf(';', equalsIndex);
		if (semiIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing ';'"));
		}

		String decl = expr.substring(4, equalsIndex).trim(); // Skip "let "
		String varName;
		String declaredType;

		// Check if type annotation is present (contains ':')
		if (decl.contains(":")) {
			String[] parts = decl.split(":");
			if (parts.length != 2) {
				return Result.err(new CompileError("Invalid let binding: expected 'varName : type'"));
			}
			varName = parts[0].trim();
			declaredType = parts[1].trim();
		} else {
			// No type annotation - will be inferred
			varName = decl.trim();
			declaredType = null;
		}

		String valueExpr = expr.substring(equalsIndex + 1, semiIndex).trim();

		return Result.ok(new LetBindingDecl(varName, declaredType, valueExpr));
	}

	public static Result<String, CompileError> extractTypeFromExpression(String expr) {
		return extractTypeFromExpression(expr, new java.util.HashMap<>());
	}

	public static Result<String, CompileError> extractTypeFromExpression(String expr,
			java.util.Map<String, String> variableTypes) {
		expr = expr.trim();

		// Handle dereference operations
		if (expr.startsWith("*")) {
			String inner = expr.substring(1).trim();
			Result<String, CompileError> innerType = extractTypeFromExpression(inner, variableTypes);
			if (innerType.isErr()) {
				return innerType;
			}
			String pointerType = innerType.okValue();
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

		// Handle reference operations (including &mut)
		if (expr.startsWith("&")) {
			String inner = expr.substring(1).trim();
			// Strip 'mut' keyword if present: &mut x -> &x
			if (inner.startsWith("mut ")) {
				inner = inner.substring(4).trim();
			}
			Result<String, CompileError> innerType = extractTypeFromExpression(inner, variableTypes);
			if (innerType.isErr()) {
				// If we can't determine the type of the inner expression, return generic pointer type
				return Result.ok("*U8");
			}
			// Taking reference of Type gives *Type (or *mut Type for mutable references)
			return Result.ok("*" + innerType.okValue());
		}

		// Handle variable references
		if (variableTypes.containsKey(expr)) {
			return Result.ok(variableTypes.get(expr));
		}

		// Handle read operations
		if (expr.startsWith("read ")) {
			String typeSpec = expr.substring(5).trim();
			if (!typeSpec.matches("\\*?[UI]\\d+")) {
				return Result.err(new CompileError("Invalid type specification: " + typeSpec));
			}
			return Result.ok(typeSpec);
		}

		// For now, return error for unknown variables/complex expressions
		// This will be handled as an error at a higher level
		return Result.err(new CompileError("Cannot infer type for expression: " + expr));
	}

	public static List<String> splitTokensByOperators(String expr, boolean isAdditive) {
		List<String> result = new ArrayList<>();
		StringBuilder token = new StringBuilder();
		int depth = 0;

		for (int i = 0; i < expr.length(); i++) {
			char c = expr.charAt(i);
			boolean isOp = isAdditive ? (c == '+' || c == '-') : (c == '*');

			// For * and & operators, check if they're unary (not binary)
			// They're unary if they appear at the start or after another operator
			if (!isAdditive && c == '*' && i == 0) {
				isOp = false; // Leading * is dereference, not multiplication
			}
			if (!isAdditive && c == '*' && i > 0) {
				// Check if previous non-whitespace character is an operator or delimiter
				int prevIdx = i - 1;
				while (prevIdx >= 0 && Character.isWhitespace(expr.charAt(prevIdx))) {
					prevIdx--;
				}
				if (prevIdx >= 0) {
					char prev = expr.charAt(prevIdx);
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
				String t = token.toString().trim();
				if (!t.isEmpty() || !isAdditive) {
					result.add(t);
				}
				token = new StringBuilder();
			} else {
				token.append(c);
			}
		}

		String t = token.toString().trim();
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
	 * 
	 * Upcasting rules:
	 * - Same type: always compatible
	 * - U8 can upcast to U16, U32
	 * - U16 can upcast to U32
	 * - I8 can upcast to I16, I32
	 * - I16 can upcast to I32
	 * - Downcast or cross-sign conversions are not allowed
	 * - Pointer types must match exactly
	 */
	public static boolean isTypeCompatible(String sourceType, String targetType) {
		if (sourceType.equals(targetType)) {
			return true;
		}

		// Strip 'mut' keyword for comparison: *mut Type -> *Type
		String sourceNorm = sourceType.replaceAll("\\*mut\\s+", "*");
		String targetNorm = targetType.replaceAll("\\*mut\\s+", "*");
		if (sourceNorm.equals(targetNorm)) {
			return true;
		}

		// Pointer types must match exactly
		boolean sourceIsPointer = sourceNorm.startsWith("*");
		boolean targetIsPointer = targetNorm.startsWith("*");
		if (sourceIsPointer != targetIsPointer) {
			return false;
		}

		// If both are pointers, recurse on the pointed-to types
		if (sourceIsPointer && targetIsPointer) {
			return isTypeCompatible(sourceNorm.substring(1), targetNorm.substring(1));
		}

		// Parse type name and bit width
		if (!sourceType.matches("[UI]\\d+") || !targetType.matches("[UI]\\d+")) {
			return false;
		}

		char sourceSign = sourceType.charAt(0);
		char targetSign = targetType.charAt(0);
		int sourceWidth = Integer.parseInt(sourceType.substring(1));
		int targetWidth = Integer.parseInt(targetType.substring(1));

		// Cross-sign conversion not allowed (U -> I or I -> U)
		if (sourceSign != targetSign) {
			return false;
		}

		// Can only upcast to same sign with larger or equal width
		return targetWidth >= sourceWidth;
	}
}
