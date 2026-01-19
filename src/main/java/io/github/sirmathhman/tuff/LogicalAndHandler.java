package io.github.sirmathhman.tuff;

import java.util.List;

public final class LogicalAndHandler {
	private LogicalAndHandler() {
	}

	public static List<String> splitByLogicalAnd(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '&', '&');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalAndExpression(
			List<String> andTokens) {
		return LogicalOperatorHandler.parseLogicalExpression(andTokens, true);
	}
}
