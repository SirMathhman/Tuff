package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

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
