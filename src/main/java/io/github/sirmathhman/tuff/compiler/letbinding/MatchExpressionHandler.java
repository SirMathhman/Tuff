package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.lib.ArrayList;

public final class MatchExpressionHandler {
	private MatchExpressionHandler() {
	}

	public static boolean hasMatch(String expr) {
		return expr.startsWith("match (");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseMatch(String expr) {
		// Convert match to conditional and parse the result
		var conversionResult = convertToConditional(expr);
		if (conversionResult instanceof Result.Err<String, CompileError>) {
			return Result.err(((Result.Err<String, CompileError>) conversionResult).error());
		}

		var conditionalExpr = ((Result.Ok<String, CompileError>) conversionResult).value();
		// Parse the generated conditional expression
		return ConditionalExpressionHandler.parseConditional(conditionalExpr);
	}

	private static Result<String, CompileError> convertToConditional(String expr) {
		// Format: match (scrutinee) { case pattern => value; ... case _ =>
		// defaultValue; }
		var scrutineeEnd = findScrutineeEnd(expr);
		if (scrutineeEnd == -1) {
			return Result.err(new CompileError("Malformed match: missing closing paren for scrutinee"));
		}

		var scrutinee = expr.substring(7, scrutineeEnd); // Skip "match ("
		var remaining = expr.substring(scrutineeEnd + 1).trim();

		if (!remaining.startsWith("{")) {
			return Result.err(new CompileError("Malformed match: expected '{' after scrutinee"));
		}

		var closingBrace = DepthAwareSplitter.findMatchingBrace(remaining, 0);
		if (closingBrace == -1) {
			return Result.err(new CompileError("Malformed match: missing closing '}'"));
		}

		var caseBlock = remaining.substring(1, closingBrace).trim();
		var casesResult = parseCases(caseBlock);
		if (casesResult instanceof Result.Err<ArrayList<MatchCase>, CompileError> caseErr) {
			return Result.err(caseErr.error());
		}

		var cases = ((Result.Ok<ArrayList<MatchCase>, CompileError>) casesResult).value();

		// Find default case
		MatchCase defaultCase = null;
		ArrayList<MatchCase> regularCases = new ArrayList<>();

		for (var c : cases) {
			if ("_".equals(c.pattern())) {
				if (defaultCase != null) {
					return Result.err(new CompileError("Multiple default cases (_) not allowed"));
				}
				defaultCase = c;
			} else {
				regularCases = regularCases.add(c);
			}
		}

		if (defaultCase == null) {
			return Result.err(new CompileError("Match expression must have a default case (_)"));
		}

		// Convert match to nested if-else conditionals
		// Start from the innermost (rightmost) case and work backwards
		var result = new StringBuilder(defaultCase.value());

		for (var i = regularCases.size() - 1; i >= 0; i--) {
			var c = regularCases.get(i);
			// Build: if (scrutinee == pattern) caseValue else previousResult
			result = new StringBuilder("if (").append(scrutinee).append(" == ").append(c.pattern()).append(") ")
					.append(c.value()).append(" else ").append(result);
		}

		return Result.ok(result.toString());
	}

	private static int findScrutineeEnd(String expr) {
		// Use the same logic as ConditionalExpressionHandler's findConditionEnd
		return ConditionalExpressionHandler.findConditionEnd(expr);
	}

	private static Result<ArrayList<MatchCase>, CompileError> parseCases(String caseBlock) {
		ArrayList<MatchCase> cases = new ArrayList<>();
		var remaining = caseBlock;

		while (!remaining.isEmpty()) {
			remaining = remaining.trim();
			if (!remaining.startsWith("case ")) {
				return Result.err(new CompileError("Expected 'case' keyword"));
			}

			remaining = remaining.substring(5).trim(); // Skip "case "

			// Find the arrow =>
			var arrowIndex = remaining.indexOf("=>");
			if (arrowIndex == -1) {
				return Result.err(new CompileError("Expected '=>' in case"));
			}

			var pattern = remaining.substring(0, arrowIndex).trim();
			remaining = remaining.substring(arrowIndex + 2).trim(); // Skip "=>"

			// Find the semicolon that ends this case
			var semiIndex = findCaseSemicolon(remaining);
			if (semiIndex == -1) {
				return Result.err(new CompileError("Expected ';' after case value"));
			}

			var value = remaining.substring(0, semiIndex).trim();
			remaining = remaining.substring(semiIndex + 1).trim(); // Skip ";"

			cases = cases.add(new MatchCase(pattern, value));
		}

		if (cases.isEmpty()) {
			return Result.err(new CompileError("Match expression must have at least one case"));
		}

		return Result.ok(cases);
	}

	private static int findCaseSemicolon(String str) {
		var depth = 0;
		for (var i = 0; i < str.length(); i++) {
			var c = str.charAt(i);
			if (c == '(' || c == '{' || c == '[') {
				depth++;
			} else if (c == ')' || c == '}' || c == ']') {
				depth--;
			} else if (c == ';' && depth == 0) {
				return i;
			}
		}
		return -1;
	}

	private static record MatchCase(String pattern, String value) {
	}
}
