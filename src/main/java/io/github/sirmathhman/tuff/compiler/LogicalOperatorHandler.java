package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.lib.ArrayList;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

public final class LogicalOperatorHandler {
	private LogicalOperatorHandler() {
	}

	// Splitting methods (consolidated from individual handlers)
	public static ArrayList<String> splitByLogicalAnd(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '&', '&');
	}

	public static ArrayList<String> splitByLogicalOr(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '|', '|');
	}

	// Parsing methods
	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalAndExpression(
			ArrayList<String> andTokens) {
		return parseLogicalExpression(andTokens, true);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalOrExpression(
			ArrayList<String> orTokens) {
		return parseLogicalExpression(orTokens, false);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalExpression(
			ArrayList<String> tokens, boolean isAndOperator) {
		ArrayList<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>();
		var totalReads = 0;
		long totalLiteral = 0;

		for (var i = 0; i < tokens.size(); i++) {
			var operandResult = App
					.parseExpressionWithRead(tokens.get(i));
			if (operandResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
				return operandResult;
			}
			if (!(operandResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> ok)) {
				return Result.err(new CompileError("Internal error: expected Ok or Err in logical operand"));
			}

			var operand = ok.value();
			// Mark the last term of each operand (except the last) with logical boundary
			if (i < tokens.size() - 1 && operand.terms().size() > 0) {
				var lastTerm = operand.terms().get(operand.terms().size() - 1);
				boolean newOrBoundary;
				if (isAndOperator)
					newOrBoundary = lastTerm.isLogicalOrBoundary();
				else
					newOrBoundary = true;
				boolean newAndBoundary;
				if (isAndOperator)
					newAndBoundary = true;
				else
					newAndBoundary = lastTerm.isLogicalAndBoundary();
				var updatedTerms = operand.terms().set(operand.terms().size() - 1,
						lastTerm.withLogicalBoundary(newOrBoundary, newAndBoundary));
				allTerms = allTerms.addAll(updatedTerms);
			} else {
				allTerms = allTerms.addAll(operand.terms());
			}
			totalReads += operand.readCount();
			totalLiteral += operand.literalValue();
		}

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
