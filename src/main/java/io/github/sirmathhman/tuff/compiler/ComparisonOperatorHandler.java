package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.ArrayList;
import java.util.List;

public final class ComparisonOperatorHandler {
	private ComparisonOperatorHandler() {
	}

	// Splitting methods (consolidated from individual handlers)
	public static List<String> splitByEquality(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '=', '=');
	}

	public static List<String> splitByInequality(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '!', '=');
	}

	public static List<String> splitByLessThan(String expr) {
		return DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '<');
	}

	public static List<String> splitByGreaterThan(String expr) {
		return DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '>');
	}

	public static List<String> splitByLessOrEqual(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '<', '=');
	}

	public static List<String> splitByGreaterOrEqual(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '>', '=');
	}

	// Parsing methods
	public static Result<ExpressionModel.ExpressionResult, CompileError> parseEqualityExpression(
			List<String> eqTokens) {
		return parseComparisonExpression(eqTokens, 0);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseInequalityExpression(
			List<String> neqTokens) {
		return parseComparisonExpression(neqTokens, 1);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLessThanExpression(
			List<String> ltTokens) {
		return parseComparisonExpression(ltTokens, 2);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseGreaterThanExpression(
			List<String> gtTokens) {
		return parseComparisonExpression(gtTokens, 3);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLessOrEqualExpression(
			List<String> leTokens) {
		return parseComparisonExpression(leTokens, 4);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseGreaterOrEqualExpression(
			List<String> geTokens) {
		return parseComparisonExpression(geTokens, 5);
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseComparisonExpression(
			List<String> tokens, int markerValue) {
		// For now, only support binary comparison (exactly 2 operands)
		if (tokens.size() != 2) {
			String opName = markerValue == 0 ? "Equality"
					: (markerValue == 1 ? "Inequality"
							: (markerValue == 2 ? "LessThan"
									: (markerValue == 3 ? "GreaterThan"
											: (markerValue == 4 ? "LessOrEqual" : "GreaterOrEqual"))));
			return Result.err(new CompileError(opName + " operator requires exactly 2 operands"));
		}

		// Parse left operand
		Result<ExpressionModel.ExpressionResult, CompileError> leftResult = AdditiveExpressionParser
				.parseAdditive(tokens.get(0));
		if (leftResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
			return leftResult;
		}
		if (!(leftResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> leftOk)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in left operand"));
		}

		// Parse right operand
		Result<ExpressionModel.ExpressionResult, CompileError> rightResult = AdditiveExpressionParser
				.parseAdditive(tokens.get(1));
		if (rightResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
			return rightResult;
		}
		if (!(rightResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> rightOk)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in right operand"));
		}

		ExpressionModel.ExpressionResult left = leftOk.value();
		ExpressionModel.ExpressionResult right = rightOk.value();

		// Create marker term: readCount=-1 indicates comparison marker
		// marker.value=0 means Equal, marker.value=1 means NotEqual, marker.value=2
		// means LessThan, marker.value=3 means GreaterThan, marker.value=4 means
		// LessOrEqual, marker.value=5 means GreaterOrEqual
		ExpressionModel.ExpressionTerm marker = new ExpressionModel.ExpressionTerm(-1, markerValue,
				new ExpressionModel.ExpressionTermFlags(0L, '\0', null));

		// Combine: left terms + marker + right terms
		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(left.terms);
		allTerms.add(marker);
		allTerms.addAll(right.terms);

		int totalReads = left.readCount + right.readCount;
		long totalLiteral = left.literalValue + right.literalValue;

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
