package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import io.github.sirmathhman.tuff.lib.ArrayList;

public final class ComparisonOperatorHandler {
	private ComparisonOperatorHandler() {
	}

	// Splitting methods (consolidated from individual handlers)
	public static ArrayList<String> splitByEquality(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '=', '=');
	}

	public static ArrayList<String> splitByInequality(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '!', '=');
	}

	public static ArrayList<String> splitByLessThan(String expr) {
		return DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '<');
	}

	public static ArrayList<String> splitByGreaterThan(String expr) {
		return DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '>');
	}

	public static ArrayList<String> splitByLessOrEqual(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '<', '=');
	}

	public static ArrayList<String> splitByGreaterOrEqual(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '>', '=');
	}

	public static ArrayList<String> splitByIsOperator(String expr) {
		return DepthAwareSplitter.splitByKeywordAtDepthZero(expr, "is");
	}

	// Parsing methods
	public static Result<ExpressionModel.ExpressionResult, CompileError> parseEqualityExpression(
			ArrayList<String> eqTokens) {
		return parseComparisonExpression(eqTokens, 0);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseInequalityExpression(
			ArrayList<String> neqTokens) {
		return parseComparisonExpression(neqTokens, 1);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLessThanExpression(
			ArrayList<String> ltTokens) {
		return parseComparisonExpression(ltTokens, 2);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseGreaterThanExpression(
			ArrayList<String> gtTokens) {
		return parseComparisonExpression(gtTokens, 3);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLessOrEqualExpression(
			ArrayList<String> leTokens) {
		return parseComparisonExpression(leTokens, 4);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseGreaterOrEqualExpression(
			ArrayList<String> geTokens) {
		return parseComparisonExpression(geTokens, 5);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseIsExpression(
			ArrayList<String> isTokens) {
		// For now, only support binary is operator (exactly 2 operands)
		if (isTokens.size() != 2) {
			return Result.err(new CompileError("Is operator requires exactly 2 operands"));
		}

		var valueExpr = isTokens.get(0).trim();
		var typeSpec = isTokens.get(1).trim();

		// Validate type specification
		if (!typeSpec.matches("\\*?([a-zA-Z_][a-zA-Z0-9_]*|[UI]\\d+|Bool|Char)")) {
			return Result.err(new CompileError("Invalid type specification for is operator: " + typeSpec));
		}

		// Parse the value expression
		var valueResult = App.parseExpressionWithRead(
				valueExpr);
		if (valueResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
			return valueResult;
		}

		var valueExprResult = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) valueResult)
				.value();

		// Create a term with marker -5 to indicate type check operation
		ArrayList<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(valueExprResult.terms());
		var typeCheckTerm = new ExpressionModel.ExpressionTerm(-5, 0,
				new ExpressionModel.ExpressionTermFlags(0L, '\0', typeSpec));
		allTerms.add(typeCheckTerm);

		return Result.ok(new ExpressionModel.ExpressionResult(valueExprResult.readCount(), 0, allTerms));
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseComparisonExpression(
			ArrayList<String> tokens, int markerValue) {
		if (tokens.size() != 2) {
			String opName = getComparisonOperatorName(markerValue);
			return Result.err(new CompileError(opName + " operator requires exactly 2 operands"));
		}

		var leftResult = AdditiveExpressionParser.parseAdditive(tokens.get(0));
		if (leftResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
			return leftResult;
		}
		if (!(leftResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> leftOk)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in left operand"));
		}

		var rightResult = AdditiveExpressionParser.parseAdditive(tokens.get(1));
		if (rightResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
			return rightResult;
		}
		if (!(rightResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> rightOk)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in right operand"));
		}

		var left = leftOk.value();
		var right = rightOk.value();
		var marker = new ExpressionModel.ExpressionTerm(-1, markerValue,
				new ExpressionModel.ExpressionTermFlags(0L, '\0', null));

		ArrayList<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(left.terms());
		allTerms.add(marker);
		allTerms.addAll(right.terms());

		var totalReads = left.readCount() + right.readCount();
		var totalLiteral = left.literalValue() + right.literalValue();

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}

	private static String getComparisonOperatorName(int markerValue) {
		return switch (markerValue) {
			case 0 -> "Equality";
			case 1 -> "Inequality";
			case 2 -> "LessThan";
			case 3 -> "GreaterThan";
			case 4 -> "LessOrEqual";
			default -> "GreaterOrEqual";
		};
	}

	/**
	 * Try to parse all comparison operators in order of precedence
	 */
	public static Result<ExpressionModel.ExpressionResult, CompileError> parseAllComparisons(String expr) {
		var le = splitByLessOrEqual(expr);
		if (le.size() > 1)
			return parseLessOrEqualExpression(le);
		var ge = splitByGreaterOrEqual(expr);
		if (ge.size() > 1)
			return parseGreaterOrEqualExpression(ge);
		var lt = splitByLessThan(expr);
		if (lt.size() > 1)
			return parseLessThanExpression(lt);
		var gt = splitByGreaterThan(expr);
		if (gt.size() > 1)
			return parseGreaterThanExpression(gt);
		var eq = splitByEquality(expr);
		if (eq.size() > 1)
			return parseEqualityExpression(eq);
		var neq = splitByInequality(expr);
		if (neq.size() > 1)
			return parseInequalityExpression(neq);
		return Result.err(new CompileError("No comparison operator found"));
	}
}
