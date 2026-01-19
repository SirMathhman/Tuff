package io.github.sirmathhman.tuff;

import java.util.ArrayList;
import java.util.List;

public final class LogicalOrHandler {
	private LogicalOrHandler() {
	}

	public static List<String> splitByLogicalOr(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '|', '|');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalOrExpression(
			List<String> orTokens) {
		// Parse each operand and generate instructions to perform logical OR
		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>();
		int totalReads = 0;
		long totalLiteral = 0;

		for (int i = 0; i < orTokens.size(); i++) {
			Result<ExpressionModel.ExpressionResult, CompileError> operandResult = App
					.parseExpressionWithRead(orTokens.get(i));
			if (operandResult.isErr()) {
				return operandResult;
			}

			ExpressionModel.ExpressionResult operand = operandResult.okValue();
			// Mark the last term of each operand (except the last) with logical OR boundary
			if (i < orTokens.size() - 1 && operand.terms.size() > 0) {
				ExpressionModel.ExpressionTerm lastTerm = operand.terms.get(operand.terms.size() - 1);
				operand.terms.set(operand.terms.size() - 1,
						new ExpressionModel.ExpressionTerm(lastTerm.readCount, lastTerm.value, lastTerm.isSubtracted,
								lastTerm.isMultiplied, lastTerm.isDivided, lastTerm.isParenthesizedGroupEnd,
								lastTerm.isDereferenced, true)); // Mark as logical OR boundary
			}

			allTerms.addAll(operand.terms);
			totalReads += operand.readCount;
			totalLiteral += operand.literalValue;
		}

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
