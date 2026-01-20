package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import java.util.ArrayList;
import java.util.List;

public final class ConditionalExpressionHandler {
	private ConditionalExpressionHandler() {
	}

	public static boolean hasConditional(String expr) {
		return expr.startsWith("if (");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseConditional(String expr) {
		// Format: if (condition) trueValue else falseValue
		int conditionEnd = findConditionEnd(expr);
		if (conditionEnd == -1) {
			return Result.err(new CompileError("Malformed conditional: missing closing paren for condition"));
		}

		String condition = expr.substring(4, conditionEnd);
		String remaining = expr.substring(conditionEnd + 1).trim();

		int elseIndex = findElseKeyword(remaining);
		if (elseIndex == -1) {
			return Result.err(new CompileError("Malformed conditional: missing 'else' clause"));
		}

		return parseConditionAndBranches(condition, remaining, elseIndex);
	}

	static int findConditionEnd(String expr) {
		int parenDepth = 1;
		for (int i = 4; i < expr.length(); i++) {
			char c = expr.charAt(i);
			if (c == '(')
				parenDepth++;
			else if (c == ')')
				parenDepth--;
			if (parenDepth == 0)
				return i;
		}
		return -1;
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseConditionAndBranches(
			String condition, String remaining, int elseIndex) {
		String trueExpr = remaining.substring(0, elseIndex).trim();
		String falseExpr = remaining.substring(elseIndex + 4).trim();

		Result<ExpressionModel.ExpressionResult, CompileError> condResult = parseExpressionForConditional(condition);
		if (condResult.isErr())
			return condResult;

		// Validate that the condition is a Bool type
		Result<String, CompileError> condTypeResult = ExpressionTokens.extractTypeFromExpression(condition,
				new java.util.HashMap<>());
		if (condTypeResult.isOk()) {
			String condType = condTypeResult.okValue();
			if (!condType.equals("Bool")) {
				return Result.err(new CompileError("Conditional expression requires Bool type, but got " + condType));
			}
		}

		Result<ExpressionModel.ExpressionResult, CompileError> trueResult = parseExpressionForConditional(trueExpr);
		if (trueResult.isErr())
			return trueResult;

		Result<ExpressionModel.ExpressionResult, CompileError> falseResult = parseExpressionForConditional(falseExpr);
		if (falseResult.isErr())
			return falseResult;

		ExpressionModel.ExpressionResult cond = condResult.okValue();
		ExpressionModel.ExpressionResult trueVal = trueResult.okValue();
		ExpressionModel.ExpressionResult falseVal = falseResult.okValue();

		ExpressionModel.ExpressionTerm branchMarker = new ExpressionModel.ExpressionTerm(
				-3, (int) trueVal.literalValue, false, false, false, false, false, false, false);
		ExpressionModel.ExpressionTerm elseMarker = new ExpressionModel.ExpressionTerm(
				-4, (int) falseVal.literalValue, false, false, false, false, false, false, false);

		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(cond.terms);
		allTerms.add(branchMarker);
		allTerms.addAll(trueVal.terms);
		allTerms.add(elseMarker);
		allTerms.addAll(falseVal.terms);

		int totalReads = cond.readCount + trueVal.readCount + falseVal.readCount;
		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, 0, allTerms));
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionForConditional(
			String expr) {
		// Simplified parser that handles comparisons - delegate to comparison parsing
		// or additive if no comparison
		expr = expr.trim();

		// Handle nested conditionals
		if (expr.startsWith("if ("))
			return parseConditional(expr);

		// Try comparison operators
		var le = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '<', '=');
		if (le.size() > 1)
			return ComparisonOperatorHandler.parseLessOrEqualExpression(le);
		var ge = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '>', '=');
		if (ge.size() > 1)
			return ComparisonOperatorHandler.parseGreaterOrEqualExpression(ge);
		var lt = DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '<');
		if (lt.size() > 1)
			return ComparisonOperatorHandler.parseLessThanExpression(lt);
		var gt = DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '>');
		if (gt.size() > 1)
			return ComparisonOperatorHandler.parseGreaterThanExpression(gt);
		var eq = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '=', '=');
		if (eq.size() > 1)
			return ComparisonOperatorHandler.parseEqualityExpression(eq);
		var neq = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '!', '=');
		if (neq.size() > 1)
			return ComparisonOperatorHandler.parseInequalityExpression(neq);

		// No comparison, parse as additive
		return AdditiveExpressionParser.parseAdditive(expr);
	}

	private static int findElseKeyword(String expr) {
		int depth = 0;
		for (int i = 0; i < expr.length() - 3; i++) {
			char c = expr.charAt(i);
			if (c == '(' || c == '{')
				depth++;
			else if (c == ')' || c == '}')
				depth--;
			else if (depth == 0 && expr.startsWith("else", i)) {
				// Make sure 'else' is not part of a larger word
				if ((i == 0 || !Character.isLetterOrDigit(expr.charAt(i - 1)))
						&& (i + 4 >= expr.length() || !Character.isLetterOrDigit(expr.charAt(i + 4)))) {
					return i;
				}
			}
		}
		return -1;
	}
}
