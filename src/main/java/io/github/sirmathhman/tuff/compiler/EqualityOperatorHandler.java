package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.List;

public final class EqualityOperatorHandler {
	private EqualityOperatorHandler() {
	}

	public static List<String> splitByEquality(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '=', '=');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseEqualityExpression(
			List<String> eqTokens) {
		return ComparisonOperatorHandler.parseEqualityExpression(eqTokens);
	}
}
