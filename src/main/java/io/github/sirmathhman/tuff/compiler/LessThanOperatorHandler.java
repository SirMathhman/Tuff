package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.List;

public final class LessThanOperatorHandler {
	private LessThanOperatorHandler() {
	}

	public static List<String> splitByLessThan(String expr) {
		return DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '<');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLessThanExpression(
			List<String> ltTokens) {
		return ComparisonOperatorHandler.parseLessThanExpression(ltTokens);
	}
}
