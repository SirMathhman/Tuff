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
		String[] parts = decl.split(":");
		if (parts.length != 2) {
			return Result.err(new CompileError("Invalid let binding: expected 'varName : type'"));
		}

		String varName = parts[0].trim();
		String declaredType = parts[1].trim();
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
}
