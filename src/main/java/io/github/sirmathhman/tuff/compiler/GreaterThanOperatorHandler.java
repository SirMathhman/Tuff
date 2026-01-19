package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.List;

public final class GreaterThanOperatorHandler {
	private GreaterThanOperatorHandler() {
	}

	public static List<String> splitByGreaterThan(String expr) {
		return DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '>');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseGreaterThanExpression(
			List<String> gtTokens) {
		return ComparisonOperatorHandler.parseGreaterThanExpression(gtTokens);
	}
}
