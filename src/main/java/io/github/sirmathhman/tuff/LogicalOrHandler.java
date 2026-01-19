package io.github.sirmathhman.tuff;

import java.util.List;

public final class LogicalOrHandler {
	private LogicalOrHandler() {
	}

	public static List<String> splitByLogicalOr(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '|', '|');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLogicalOrExpression(
			List<String> orTokens) {
		return LogicalOperatorHandler.parseLogicalExpression(orTokens, false);
	}
}
