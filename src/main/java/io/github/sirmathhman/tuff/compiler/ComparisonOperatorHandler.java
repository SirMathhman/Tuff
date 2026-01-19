package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.ArrayList;
import java.util.List;

public final class ComparisonOperatorHandler {
	private ComparisonOperatorHandler() {
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseEqualityExpression(
			List<String> eqTokens) {
		// For now, only support binary equality (exactly 2 operands)
		if (eqTokens.size() != 2) {
			return Result.err(new CompileError("Equality operator requires exactly 2 operands"));
		}

		// Parse left operand
		Result<ExpressionModel.ExpressionResult, CompileError> leftResult = AdditiveExpressionParser
				.parseAdditive(eqTokens.get(0));
		if (leftResult.isErr()) {
			return leftResult;
		}

		// Parse right operand
		Result<ExpressionModel.ExpressionResult, CompileError> rightResult = AdditiveExpressionParser
				.parseAdditive(eqTokens.get(1));
		if (rightResult.isErr()) {
			return rightResult;
		}

		ExpressionModel.ExpressionResult left = leftResult.okValue();
		ExpressionModel.ExpressionResult right = rightResult.okValue();

		// Create marker term: readCount=-1 indicates "equality comparison marker"
		ExpressionModel.ExpressionTerm marker = new ExpressionModel.ExpressionTerm(
				-1, 0, false, false, false, false, false, false, false);

		// Combine: left terms + marker + right terms
		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(left.terms);
		allTerms.add(marker);
		allTerms.addAll(right.terms);

		int totalReads = left.readCount + right.readCount;
		long totalLiteral = left.literalValue + right.literalValue;

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
