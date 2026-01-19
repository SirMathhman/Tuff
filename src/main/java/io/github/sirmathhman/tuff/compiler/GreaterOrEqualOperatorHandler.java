package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.List;

public final class GreaterOrEqualOperatorHandler {
	private GreaterOrEqualOperatorHandler() {
	}

	public static List<String> splitByGreaterOrEqual(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '>', '=');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseGreaterOrEqualExpression(
			List<String> geTokens) {
		return ComparisonOperatorHandler.parseGreaterOrEqualExpression(geTokens);
	}
}
