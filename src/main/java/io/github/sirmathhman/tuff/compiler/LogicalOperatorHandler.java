package io.github.sirmathhman.tuff;

import java.util.ArrayList;
import java.util.List;

public final class LogicalOperatorHandler {
	private LogicalOperatorHandler() {
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalExpression(
			List<String> tokens, boolean isAndOperator) {
		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>();
		int totalReads = 0;
		long totalLiteral = 0;

		for (int i = 0; i < tokens.size(); i++) {
			Result<ExpressionModel.ExpressionResult, CompileError> operandResult = App
					.parseExpressionWithRead(tokens.get(i));
			if (operandResult.isErr()) {
				return operandResult;
			}

			ExpressionModel.ExpressionResult operand = operandResult.okValue();
			// Mark the last term of each operand (except the last) with logical boundary
			if (i < tokens.size() - 1 && operand.terms.size() > 0) {
				ExpressionModel.ExpressionTerm lastTerm = operand.terms.get(operand.terms.size() - 1);
				boolean newOrBoundary = isAndOperator ? lastTerm.isLogicalOrBoundary : true;
				boolean newAndBoundary = isAndOperator ? true : lastTerm.isLogicalAndBoundary;
				operand.terms.set(operand.terms.size() - 1,
						new ExpressionModel.ExpressionTerm(lastTerm.readCount, lastTerm.value, lastTerm.isSubtracted,
								lastTerm.isMultiplied, lastTerm.isDivided, lastTerm.isParenthesizedGroupEnd,
								lastTerm.isDereferenced, newOrBoundary, newAndBoundary));
			}

			allTerms.addAll(operand.terms);
			totalReads += operand.readCount;
			totalLiteral += operand.literalValue;
		}

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
