package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.List;

public final class LessOrEqualOperatorHandler {
	private LessOrEqualOperatorHandler() {
	}

	public static List<String> splitByLessOrEqual(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '<', '=');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLessOrEqualExpression(
			List<String> leTokens) {
		return ComparisonOperatorHandler.parseLessOrEqualExpression(leTokens);
	}
}
