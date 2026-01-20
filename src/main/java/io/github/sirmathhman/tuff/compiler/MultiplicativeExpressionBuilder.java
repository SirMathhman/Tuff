package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.ArrayList;
import java.util.List;

public final class MultiplicativeExpressionBuilder {
	private MultiplicativeExpressionBuilder() {
	}

	@FunctionalInterface
	public interface ExpressionParser {
		Result<ExpressionModel.ExpressionResult, CompileError> parse(String expr);
	}

	public static Result<ExpressionModel.ParsedMult, CompileError> parseMultiplicative(String expr,
			boolean isSubtracted, ExpressionParser parser) {
		List<ExpressionModel.MultOperatorToken> multTokens = splitByMultOperators(expr);
		List<ExpressionModel.ExpressionTerm> multTerms = new ArrayList<>();
		long multLiteral = 1;
		int lastExpandedParensSize = 0;

		for (int j = 0; j < multTokens.size(); j++) {
			ExpressionModel.MultOperatorToken opToken = multTokens.get(j);
			String multToken = opToken.token.trim();
			char operator = opToken.operator;

			if (multToken.startsWith("(") && multToken.endsWith(")")) {
				Result<ExpressionModel.ParenthesizedTokenResult, CompileError> pResult = processParenthesizedToken(multToken, j,
						isSubtracted, multTokens.size(), parser);
				if (pResult.isErr()) {
					return Result.err(pResult.errValue());
				}
				ExpressionModel.ParenthesizedTokenResult pData = pResult.okValue();
				multTerms.addAll(pData.terms());
				Result<Long, CompileError> litResult = updateLiteral(multLiteral, pData.literalValue(), j == 0, operator);
				if (litResult.isErr()) {
					return Result.err(litResult.errValue());
				}
				multLiteral = litResult.okValue();
				lastExpandedParensSize = pData.expandedSize();
			} else {
				Result<ExpressionModel.ExpressionTerm, CompileError> termResult = BitwiseNotParser.parseTermWithNot(multToken);
				if (termResult.isErr()) {
					return Result.err(termResult.errValue());
				}

				ExpressionModel.ExpressionTerm baseTerm = termResult.okValue();
				boolean isMultiplied = (j > 0 && operator == '*');
				boolean isDivided = (j > 0 && operator == '/');
				ExpressionModel.ExpressionTerm finalTerm = new ExpressionModel.ExpressionTerm(baseTerm.readCount,
						baseTerm.value, isSubtracted, isMultiplied,
					isDivided, false, false, false, false, baseTerm.isBitwiseNotted(), baseTerm.isLogicalNotted(), (j > 0) ? operator : '\0',
						baseTerm.readTypeSpec);
				multTerms.add(finalTerm);

				Result<Long, CompileError> litResult = updateLiteral(multLiteral, baseTerm.value, j == 0, operator);
				if (litResult.isErr()) {
					return Result.err(litResult.errValue());
				}
				multLiteral = litResult.okValue();
				lastExpandedParensSize = 0;
			}
		}
		fixGroupingBoundaries(multTerms, lastExpandedParensSize, multTokens.size());
		int totalReads = multTerms.stream().mapToInt(t -> t.readCount).sum();
		return Result.ok(new ExpressionModel.ParsedMult(totalReads, multLiteral, multTerms));
	}

	private static Result<Long, CompileError> updateLiteral(long current, long value, boolean isFirst, char operator) {
		if (isFirst) {
			return Result.ok(value);
		}
		return switch (operator) {
			case '/' -> Result.ok(value != 0 ? current / value : current);
			case '&' -> Result.ok(current & value);
			case '|' -> Result.ok(current | value);
			case '^' -> Result.ok(current ^ value);
			case '<' -> Result.ok(current << value);
			case '>' -> Result.ok(current >> value);
			default -> Result.ok(current * value);
		};
	}

	private static void fixGroupingBoundaries(List<ExpressionModel.ExpressionTerm> multTerms, int lastExpandedParensSize,
			int multTokensSize) {
		if (lastExpandedParensSize > 1 && multTokensSize > 1) {
			int lastJ0Index = lastExpandedParensSize - 1;
			if (lastJ0Index + 1 < multTerms.size()) {
				ExpressionModel.ExpressionTerm nextTerm = multTerms.get(lastJ0Index + 1);
				if (nextTerm.isMultiplied() || nextTerm.isDivided()) {
					ExpressionModel.ExpressionTerm termToMark = multTerms.get(lastJ0Index);
					multTerms.set(lastJ0Index, new ExpressionModel.ExpressionTerm(termToMark.readCount, termToMark.value,
							termToMark.isSubtracted(), true));
				}
			}
		}
	}

	private static Result<ExpressionModel.ParenthesizedTokenResult, CompileError> processParenthesizedToken(
			String multToken,
			int position, boolean isSubtracted, int totalTokens,
			ExpressionParser expressionParser) {
		String inner = multToken.substring(1, multToken.length() - 1);
		Result<ExpressionModel.ExpressionResult, CompileError> innerResult = expressionParser.parse(inner);
		if (innerResult.isErr()) {
			return Result.err(innerResult.errValue());
		}

		ExpressionModel.ExpressionResult innerExpr = innerResult.okValue();
		List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();

		if (position == 0) {
			// First term: expand the inner expression, keeping original isMultiplied states
			for (int i = 0; i < innerExpr.terms.size(); i++) {
				ExpressionModel.ExpressionTerm innerTerm = innerExpr.terms.get(i);
				boolean isLastOfGroup = (i == innerExpr.terms.size() - 1) && totalTokens > 1;
				ExpressionModel.ExpressionTerm finalTerm = new ExpressionModel.ExpressionTerm(innerTerm.readCount,
						innerTerm.value,
						isSubtracted, innerTerm.isMultiplied(), false, isLastOfGroup);
				terms.add(finalTerm);
			}
			return Result
					.ok(new ExpressionModel.ParenthesizedTokenResult(terms, innerExpr.literalValue, innerExpr.terms.size()));
		} else {
			// Multiplicative position: only support simple reads/literals
			if (innerExpr.readCount > 1) {
				return Result.err(new CompileError(
						"Parenthesized expressions with multiple reads in multiplicative position not yet supported: "
								+ multToken));
			}

			for (int k = 0; k < innerExpr.terms.size(); k++) {
				ExpressionModel.ExpressionTerm innerTerm = innerExpr.terms.get(k);
				boolean isMultiplied = (k == 0) ? true : innerTerm.isMultiplied();
				ExpressionModel.ExpressionTerm finalTerm = new ExpressionModel.ExpressionTerm(innerTerm.readCount,
						innerTerm.value,
						isSubtracted, isMultiplied);
				terms.add(finalTerm);
			}
			return Result.ok(new ExpressionModel.ParenthesizedTokenResult(terms, innerExpr.literalValue, 0));
		}
	}

	private static List<ExpressionModel.MultOperatorToken> splitByMultOperators(String expr) {
		List<ExpressionModel.MultOperatorToken> result = new ArrayList<>();
		StringBuilder token = new StringBuilder();
		char lastOp = '\0';
		int depth = 0;

		for (int i = 0; i < expr.length(); i++) {
			char c = expr.charAt(i);

			if (c == '(') {
				depth++;
				token.append(c);
			} else if (c == ')') {
				depth--;
				token.append(c);
			} else if ((c == '*' || c == '/' || c == '&' || c == '|' || c == '^') && depth == 0) {
				if ((c == '&' || c == '|') && i + 1 < expr.length() && expr.charAt(i + 1) == c) {
					token.append(c);
				} else {
					result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
					token = new StringBuilder();
					lastOp = c;
				}
			} else if ((c == '<' || c == '>') && depth == 0) {
				if (i + 1 < expr.length() && expr.charAt(i + 1) == c) {
					result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
					token = new StringBuilder();
					lastOp = c;
					i++;
				} else {
					token.append(c);
				}
			} else {
				token.append(c);
			}
		}

		result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
		return result;
	}
}
