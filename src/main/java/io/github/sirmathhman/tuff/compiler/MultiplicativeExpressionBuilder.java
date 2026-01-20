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
				if (pResult instanceof Result.Err<ExpressionModel.ParenthesizedTokenResult, CompileError> err)
					return Result.err(err.error());
				ExpressionModel.ParenthesizedTokenResult pData = ((Result.Ok<ExpressionModel.ParenthesizedTokenResult, CompileError>) pResult).value();
				multTerms.addAll(pData.terms());
				Result<Long, CompileError> lit1 = updateLiteral(multLiteral, pData.literalValue(), j == 0, operator);
				if (lit1 instanceof Result.Err<Long, CompileError> err) return Result.err(err.error());
				multLiteral = ((Result.Ok<Long, CompileError>) lit1).value();
				lastExpandedParensSize = pData.expandedSize();
			} else {
				Result<ExpressionModel.ExpressionTerm, CompileError> termResult = BitwiseNotParser.parseTermWithNot(multToken);
				if (termResult instanceof Result.Err<ExpressionModel.ExpressionTerm, CompileError> err)
					return Result.err(err.error());
				ExpressionModel.ExpressionTerm baseTerm = ((Result.Ok<ExpressionModel.ExpressionTerm, CompileError>) termResult).value();
				multTerms.add(new ExpressionModel.ExpressionTerm(baseTerm.readCount, baseTerm.value, isSubtracted,
						j > 0 && operator == '*', j > 0 && operator == '/', false, false, false, false,
						baseTerm.isBitwiseNotted(), baseTerm.isLogicalNotted(), (j > 0) ? operator : '\0', baseTerm.readTypeSpec));
				Result<Long, CompileError> lit2 = updateLiteral(multLiteral, baseTerm.value, j == 0, operator);
				if (lit2 instanceof Result.Err<Long, CompileError> err) return Result.err(err.error());
				multLiteral = ((Result.Ok<Long, CompileError>) lit2).value();
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
		if (innerResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> err) {
			return Result.err(err.error());
		}
		if (!(innerResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing parenthesized expression"));
		}

		ExpressionModel.ExpressionResult innerExpr = ok.value();
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
