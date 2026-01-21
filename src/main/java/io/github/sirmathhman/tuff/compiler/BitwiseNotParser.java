package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.ArrayList;

public final class BitwiseNotParser {
	private BitwiseNotParser() {
	}

	public static Result<ExpressionModel.ExpressionTerm, CompileError> parseTermWithNot(String term) {
		var t = term.trim();

		if (t.isEmpty()) {
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}

		// Handle logical NOT (!)
		var isLogicalNotted = false;
		if (t.startsWith("!")) {
			isLogicalNotted = true;
			t = t.substring(1).trim();
		}

		// Handle bitwise NOT (~)
		var isBitwiseNotted = false;
		if (t.startsWith("~")) {
			isBitwiseNotted = true;
			t = t.substring(1).trim();
		}

		var baseResult = parseBaseTerm(t);
		if (baseResult instanceof Result.Err<ExpressionModel.ExpressionTerm, CompileError>) {
			return baseResult;
		}
		if (!(baseResult instanceof Result.Ok<ExpressionModel.ExpressionTerm, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in parseBaseTerm"));
		}
		var baseTerm = ok.value();

		if (isLogicalNotted) {
			return applyLogicalNot(baseTerm, t);
		}

		if (!isBitwiseNotted) {
			return baseResult;
		}

		return applyBitwiseNot(baseTerm, t);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseBaseTerm(String term) {
		// Reject tuple expressions - they should not reach the term parser
		if (ExpressionTokens.isTupleExpression(term)) {
			return Result.err(new CompileError("Tuple expressions cannot be parsed as terms"));
		}
		if (term.startsWith("read ")) {
			return parseReadTerm(term);
		}
		if (term.startsWith("&") || term.startsWith("*")) {
			return parsePointerTerm(term);
		}
		return parseLiteralTerm(term);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseReadTerm(String term) {
		var typeSpec = term.substring(5).trim();
		// Reject type specs containing commas (indicative of malformed tuple parsing)
		if (typeSpec.contains(",")) {
			return Result.err(new CompileError("Invalid tuple expression in term position: " + term));
		}
		// Accept any valid identifier (primitive types, type aliases, pointers, arrays)
		if (!typeSpec.matches("\\*?([a-zA-Z_][a-zA-Z0-9_]*|[UI]\\d+|Bool|Char)")) {
			return Result.err(new CompileError("Invalid type specification: " + typeSpec));
		}
		return Result.ok(new ExpressionModel.ExpressionTerm(1, 0,
				new ExpressionModel.ExpressionTermFlags(0L, '\0', typeSpec)));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parsePointerTerm(String term) {
		var inner = term.substring(1).trim();
		if (inner.startsWith("mut ")) {
			inner = inner.substring(4).trim();
		}
		return parseTermWithNot(inner);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseLiteralTerm(String term) {
		var t = term;
		var parenMatcher = java.util.regex.Pattern
				.compile("^\\(([a-zA-Z_][a-zA-Z0-9_]*)\\)((?:\\[\\d+\\])+)$")
				.matcher(t);
		if (parenMatcher.matches()) {
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}

		var pointerMatcher = java.util.regex.Pattern
				.compile("^\\((&(?:mut\\s+)?[a-zA-Z_][a-zA-Z0-9_]*)\\)((?:\\[\\d+\\])+)$")
				.matcher(t);
		if (pointerMatcher.matches()) {
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}

		var tupleMatcher = java.util.regex.Pattern
				.compile("^\\(\\((.+?)\\)\\)\\[(\\d+)\\]$")
				.matcher(t);
		if (tupleMatcher.matches()) {
			var tupleExpr = tupleMatcher.group(1);
			var index = Integer.parseInt(tupleMatcher.group(2));
			var elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(tupleExpr, ',');
			if (index >= 0 && index < elements.size()) {
				return parseTermWithNot(elements.get(index).trim());
			} else {
				return Result.err(new CompileError("Tuple index " + index + " out of bounds"));
			}
		}

		var arrayMatcher = java.util.regex.Pattern
				.compile("^\\(\\[\\[(.+?)\\]\\]\\)((?:\\[\\d+\\])+)$")
				.matcher(t);
		if (arrayMatcher.matches()) {
			return applyIndices(arrayMatcher.group(1), arrayMatcher.group(2));
		}

		if (t.startsWith("(") && t.endsWith(")")) {
			var inner = t.substring(1, t.length() - 1);
			if (inner.startsWith("[") && inner.endsWith("]")) {
				return parseTermWithNot(inner);
			}
		}

		if (t.startsWith("this.")) {
			var fieldName = t.substring(5).trim();
			if (!fieldName.matches("[a-zA-Z_][a-zA-Z0-9_]*") && !fieldName.matches("[a-zA-Z_][a-zA-Z0-9_]*\\s*\\(.*\\)")) {
				return Result.err(new CompileError("Invalid field name after 'this': " + fieldName));
			}
			t = fieldName;
		}

		return parseLiteralValue(t);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseLiteralValue(String term) {
		var literalResult = ExpressionTokens.parseLiteral(term);
		if (literalResult instanceof Result.Err<Long, CompileError> err) {
			if (!term.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
				return Result.err(err.error());
			}
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}
		var ok = (Result.Ok<Long, CompileError>) literalResult;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, ok.value(), false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyIndices(String arrayExpr,
			String indexChain) {
		// Extract all indices from the chain
		var indexPattern = java.util.regex.Pattern.compile("\\[(\\d+)\\]");
		var indexMatcher = indexPattern.matcher(indexChain);
		ArrayList<Integer> indices = new ArrayList<>();
		while (indexMatcher.find()) {
			indices.add(Integer.parseInt(indexMatcher.group(1)));
		}

		var current = arrayExpr;
		var isFirstIteration = true;

		for (var i = 0; i < indices.size(); i++) {
			int index = indices.get(i);

			var toSplit = current;

			// On first iteration, we have the raw array content (already unwrapped by
			// regex)
			// On subsequent iterations, we need to strip the wrapping we added
			if (!isFirstIteration && current.startsWith("[") && current.endsWith("]")) {
				// Check if first [ matches last ] at top level
				var depth = 0;
				var isTopLevelPair = true;
				for (var j = 0; j < current.length(); j++) {
					if (current.charAt(j) == '[')
						depth++;
					else if (current.charAt(j) == ']') {
						depth--;
						if (depth == 0 && j < current.length() - 1) {
							// Reached closing bracket before end of string
							isTopLevelPair = false;
							break;
						}
					}
				}
				if (isTopLevelPair && depth == 0) {
					toSplit = current.substring(1, current.length() - 1).trim();
				}
			}

			// Split by comma at depth 0
			var elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(toSplit, ',');

			if (index >= 0 && index < elements.size()) {
				current = elements.get(index).trim();
			} else {
				return Result
						.err(new CompileError("Array index " + index + " out of bounds (array size " + elements.size() + ")"));
			}

			isFirstIteration = false;
		}

		// If final result is an array expression, return zero (same as direct array
		// parsing)
		if (current.startsWith("[") && current.endsWith("]")) {
			// Check if it's a valid array expression (has elements, no semicolons)
			var inner = current.substring(1, current.length() - 1);
			var elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ',');
			if (elements.size() >= 1 && !inner.contains(";")) {
				// Valid array expression - return zero result (matches
				// App.parseExpressionWithRead behavior)
				return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
			}
		}

		// Otherwise recursively parse the final element
		return parseTermWithNot(current);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyBitwiseNot(
			ExpressionModel.ExpressionTerm baseTerm, String originalTerm) {
		// For read operations, set the isBitwiseNotted flag
		if (baseTerm.readCount > 0) {
			return applyUnaryOperator(baseTerm, true, false);
		}

		// For literals, compute the NOT directly
		var litValue = baseTerm.value;
		String typeSuffix = null;
		if (originalTerm.matches(".*[UI]\\d+$")) {
			typeSuffix = originalTerm.replaceAll("^.*([UI]\\d+)$", "$1");
		}
		var mask = 0xFFFFFFFFL;
		if (typeSuffix != null) {
			var bits = Integer.parseInt(typeSuffix.substring(1));
			mask = (1L << bits) - 1;
		}
		litValue = ~litValue & mask;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, litValue, false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyLogicalNot(
			ExpressionModel.ExpressionTerm baseTerm, @SuppressWarnings("unused") String originalTerm) {
		// For read operations, set the isLogicalNotted flag
		if (baseTerm.readCount > 0) {
			return applyUnaryOperator(baseTerm, false, true);
		}

		// For literals, compute the NOT directly (0 -> 1, nonzero -> 0)
		var litValue = baseTerm.value;
		if (litValue == 0)
			litValue = 1;
		else
			litValue = 0;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, litValue, false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyUnaryOperator(
			ExpressionModel.ExpressionTerm baseTerm, boolean isBitwiseNotted, boolean isLogicalNotted) {
		var flags = ExpressionModel.ExpressionTermFlags.empty()
				.withBitwiseNotted(isBitwiseNotted)
				.withLogicalNotted(isLogicalNotted)
				.withReadTypeSpec(baseTerm.readTypeSpec);
		return Result.ok(new ExpressionModel.ExpressionTerm(baseTerm.readCount, baseTerm.value,
				flags));
	}
}
