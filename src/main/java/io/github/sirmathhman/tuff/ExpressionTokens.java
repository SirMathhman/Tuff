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
		expr = expr.trim();

		// Handle read operations
		if (expr.startsWith("read ")) {
			String typeSpec = expr.substring(5).trim();
			if (!typeSpec.matches("[UI]\\d+")) {
				return Result.err(new CompileError("Invalid type specification: " + typeSpec));
			}
			return Result.ok(typeSpec);
		}

		// For now, we only support type extraction for simple read operations
		// Complex expressions would need more sophisticated type inference
		return Result.err(new CompileError("Cannot infer type for complex expression: " + expr));
	}

	public static List<String> splitTokensByOperators(String expr, boolean isAdditive) {
		List<String> result = new ArrayList<>();
		StringBuilder token = new StringBuilder();
		int depth = 0;

		for (char c : expr.toCharArray()) {
			boolean isOp = isAdditive ? (c == '+' || c == '-') : (c == '*');
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
	 */
	public static boolean isTypeCompatible(String sourceType, String targetType) {
		if (sourceType.equals(targetType)) {
			return true;
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
