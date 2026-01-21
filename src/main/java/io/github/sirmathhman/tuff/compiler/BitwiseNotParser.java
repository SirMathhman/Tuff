package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import java.util.List;

public final class BitwiseNotParser {
	private BitwiseNotParser() {
	}

	public static Result<ExpressionModel.ExpressionTerm, CompileError> parseTermWithNot(String term) {
		term = term.trim();

		if (term.isEmpty()) {
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}

		// Handle logical NOT (!)
		boolean isLogicalNotted = false;
		if (term.startsWith("!")) {
			isLogicalNotted = true;
			term = term.substring(1).trim();
		}

		// Handle bitwise NOT (~)
		boolean isBitwiseNotted = false;
		if (term.startsWith("~")) {
			isBitwiseNotted = true;
			term = term.substring(1).trim();
		}

		Result<ExpressionModel.ExpressionTerm, CompileError> baseResult = parseBaseTerm(term);
		if (baseResult instanceof Result.Err<ExpressionModel.ExpressionTerm, CompileError>) {
			return baseResult;
		}
		if (!(baseResult instanceof Result.Ok<ExpressionModel.ExpressionTerm, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in parseBaseTerm"));
		}
		ExpressionModel.ExpressionTerm baseTerm = ok.value();

		if (isLogicalNotted) {
			return applyLogicalNot(baseTerm, term);
		}

		if (!isBitwiseNotted) {
			return baseResult;
		}

		return applyBitwiseNot(baseTerm, term);
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
		String typeSpec = term.substring(5).trim();
		// Reject type specs containing commas (indicative of malformed tuple parsing)
		if (typeSpec.contains(",")) {
			return Result.err(new CompileError("Invalid tuple expression in term position: " + term));
		}
		if (!typeSpec.matches("\\*?([UI]\\d+|Bool)")) {
			return Result.err(new CompileError("Invalid type specification: " + typeSpec));
		}
		return Result.ok(new ExpressionModel.ExpressionTerm(1, 0,
				new ExpressionModel.ExpressionTermFlags(0L, '\0', typeSpec)));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parsePointerTerm(String term) {
		String inner = term.substring(1).trim();
		if (inner.startsWith("mut ")) {
			inner = inner.substring(4).trim();
		}
		return parseTermWithNot(inner);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseLiteralTerm(String term) {
		// Handle tuple indexing: ((expr1, expr2, ...))[index]
		java.util.regex.Pattern tupleIndexPattern = java.util.regex.Pattern.compile("^\\(\\((.+)\\)\\)\\[(\\d+)\\]$");
		java.util.regex.Matcher tupleIndexMatcher = tupleIndexPattern.matcher(term);
		if (tupleIndexMatcher.matches()) {
			String tupleExpr = tupleIndexMatcher.group(1);
			int index = Integer.parseInt(tupleIndexMatcher.group(2));

			// Split the tuple expression by comma at depth 0
			java.util.List<String> elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(tupleExpr, ',');
			if (index >= 0 && index < elements.size()) {
				String element = elements.get(index).trim();
				// Recursively parse the element
				return parseTermWithNot(element);
			} else {
				return Result.err(new CompileError("Tuple index " + index + " out of bounds"));
			}
		}

		// Handle array indexing: ([[elem1, elem2, ...]))[index]
		java.util.regex.Pattern arrayIndexPattern = java.util.regex.Pattern.compile("^\\(\\[\\[(.+)\\]\\]\\)\\[(\\d+)\\]$");
		java.util.regex.Matcher arrayIndexMatcher = arrayIndexPattern.matcher(term);
		if (arrayIndexMatcher.matches()) {
			String arrayExpr = arrayIndexMatcher.group(1);
			int index = Integer.parseInt(arrayIndexMatcher.group(2));

			// Split the array expression by comma at depth 0
			java.util.List<String> elements = DepthAwareSplitter.splitByDelimiterAtDepthZero(arrayExpr, ',');
			if (index >= 0 && index < elements.size()) {
				String element = elements.get(index).trim();
				// Recursively parse the element
				return parseTermWithNot(element);
			} else {
				return Result.err(new CompileError("Array index " + index + " out of bounds"));
			}
		}

		// Handle this.x or this.functionName() syntax - normalize and treat as
		// variable/function reference
		if (term.startsWith("this.")) {
			String fieldName = term.substring(5).trim();
			// Allow function call syntax with parentheses
			if (!fieldName.matches("[a-zA-Z_][a-zA-Z0-9_]*") && !fieldName.matches("[a-zA-Z_][a-zA-Z0-9_]*\\s*\\(.*\\)")) {
				return Result.err(new CompileError("Invalid field name after 'this': " + fieldName));
			}
			// Normalize this.x or this.get() to just x or get()
			term = fieldName;
		}

		Result<Long, CompileError> literalResult = ExpressionTokens.parseLiteral(term);
		if (literalResult instanceof Result.Err<Long, CompileError> err) {
			if (!term.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
				return Result.err(err.error());
			}
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}
		if (!(literalResult instanceof Result.Ok<Long, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in parseLiteral"));
		}
		return Result.ok(new ExpressionModel.ExpressionTerm(0, ok.value(), false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyBitwiseNot(
			ExpressionModel.ExpressionTerm baseTerm, String originalTerm) {
		// For read operations, set the isBitwiseNotted flag
		if (baseTerm.readCount > 0) {
			return applyUnaryOperator(baseTerm, true, false);
		}

		// For literals, compute the NOT directly
		long litValue = baseTerm.value;
		String typeSuffix = null;
		if (originalTerm.matches(".*[UI]\\d+$")) {
			typeSuffix = originalTerm.replaceAll("^.*([UI]\\d+)$", "$1");
		}
		long mask = 0xFFFFFFFFL;
		if (typeSuffix != null) {
			int bits = Integer.parseInt(typeSuffix.substring(1));
			mask = (1L << bits) - 1;
		}
		litValue = ~litValue & mask;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, litValue, false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyLogicalNot(
			ExpressionModel.ExpressionTerm baseTerm, String originalTerm) {
		// For read operations, set the isLogicalNotted flag
		if (baseTerm.readCount > 0) {
			return applyUnaryOperator(baseTerm, false, true);
		}

		// For literals, compute the NOT directly (0 -> 1, nonzero -> 0)
		long litValue = baseTerm.value;
		litValue = litValue == 0 ? 1 : 0;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, litValue, false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyUnaryOperator(
			ExpressionModel.ExpressionTerm baseTerm, boolean isBitwiseNotted, boolean isLogicalNotted) {
		ExpressionModel.ExpressionTermFlags flags = ExpressionModel.ExpressionTermFlags.empty()
				.withBitwiseNotted(isBitwiseNotted)
				.withLogicalNotted(isLogicalNotted)
				.withReadTypeSpec(baseTerm.readTypeSpec);
		return Result.ok(new ExpressionModel.ExpressionTerm(baseTerm.readCount, baseTerm.value,
				flags));
	}
}
