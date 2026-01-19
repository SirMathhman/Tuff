package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.List;

public final class InequalityOperatorHandler {
	private InequalityOperatorHandler() {
	}

	public static List<String> splitByInequality(String expr) {
		return DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '!', '=');
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseInequalityExpression(
			List<String> neqTokens) {
		return ComparisonOperatorHandler.parseInequalityExpression(neqTokens);
	}
}
