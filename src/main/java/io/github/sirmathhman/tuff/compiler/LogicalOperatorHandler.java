package io.github.sirmathhman.tuff.compiler;

import java.util.ArrayList;
import java.util.List;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

public final class LogicalOperatorHandler {
	private LogicalOperatorHandler() {
	}

	// Splitting methods (consolidated from individual handlers)
	public static List<String> splitByLogicalAnd(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '&', '&');
	}

	public static List<String> splitByLogicalOr(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '|', '|');
	}

	// Parsing methods
	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalAndExpression(
			List<String> andTokens) {
		return parseLogicalExpression(andTokens, true);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalOrExpression(
			List<String> orTokens) {
		return parseLogicalExpression(orTokens, false);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalExpression(
			List<String> tokens, boolean isAndOperator) {
		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>();
		int totalReads = 0;
		long totalLiteral = 0;

		for (int i = 0; i < tokens.size(); i++) {
			Result<ExpressionModel.ExpressionResult, CompileError> operandResult = App
					.parseExpressionWithRead(tokens.get(i));
			if (operandResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
				return operandResult;
			}
			if (!(operandResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> ok)) {
				return Result.err(new CompileError("Internal error: expected Ok or Err in logical operand"));
			}

			ExpressionModel.ExpressionResult operand = ok.value();
			// Mark the last term of each operand (except the last) with logical boundary
			if (i < tokens.size() - 1 && operand.terms.size() > 0) {
				ExpressionModel.ExpressionTerm lastTerm = operand.terms.get(operand.terms.size() - 1);
				boolean newOrBoundary = isAndOperator ? lastTerm.isLogicalOrBoundary() : true;
				boolean newAndBoundary = isAndOperator ? true : lastTerm.isLogicalAndBoundary();
				operand.terms.set(operand.terms.size() - 1, lastTerm.withLogicalBoundary(newOrBoundary, newAndBoundary));
			}

			allTerms.addAll(operand.terms);
			totalReads += operand.readCount;
			totalLiteral += operand.literalValue;
		}

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
