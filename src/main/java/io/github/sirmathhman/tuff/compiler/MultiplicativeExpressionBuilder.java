package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import io.github.sirmathhman.tuff.lib.ArrayList;

public final class MultiplicativeExpressionBuilder {
	private MultiplicativeExpressionBuilder() {
	}

	@FunctionalInterface
	public interface ExpressionParser {
		Result<ExpressionModel.ExpressionResult, CompileError> parse(String expr);
	}

	public static Result<ExpressionModel.ParsedMult, CompileError> parseMultiplicative(String expr,
			boolean isSubtracted, ExpressionParser parser) {
		var multTokens = splitByMultOperators(expr);
		ArrayList<ExpressionModel.ExpressionTerm> multTerms = new ArrayList<>();
		long multLiteral = 1;
		var lastExpandedParensSize = 0;
		for (var j = 0; j < multTokens.size(); j++) {
			var opToken = multTokens.get(j);
			var multToken = opToken.token().trim();
			var operator = opToken.operator();
			if (multToken.startsWith("(") && multToken.endsWith(")")) {
				var pResult = processParenthesizedToken(multToken, j, isSubtracted, multTokens.size(), parser);
				if (pResult instanceof Result.Err<ExpressionModel.ParenthesizedTokenResult, CompileError> err)
					return Result.err(err.error());
				var pData = ((Result.Ok<ExpressionModel.ParenthesizedTokenResult, CompileError>) pResult).value();
				multTerms = multTerms.addAll(pData.terms());
				var lit1 = updateLiteral(multLiteral, pData.literalValue(), j == 0, operator);
				if (lit1 instanceof Result.Err<Long, CompileError> err)
					return Result.err(err.error());
				multLiteral = ((Result.Ok<Long, CompileError>) lit1).value();
				lastExpandedParensSize = pData.expandedSize();
			} else {
				var termResult = processNonParenthesizedToken(multToken, isSubtracted, j, operator);
				if (termResult instanceof Result.Err<Object, CompileError> err)
					return Result.err(err.error());
				var data = ((Result.Ok<Object, CompileError>) termResult).value();
				var baseTerm = (ExpressionModel.ExpressionTerm) data;
				multTerms = multTerms.add(baseTerm);
				var lit2 = updateLiteral(multLiteral, baseTerm.value, j == 0, operator);
				if (lit2 instanceof Result.Err<Long, CompileError> err)
					return Result.err(err.error());
				multLiteral = ((Result.Ok<Long, CompileError>) lit2).value();
				lastExpandedParensSize = 0;
			}
		}
		fixGroupingBoundaries(multTerms, lastExpandedParensSize, multTokens.size());
		var totalReads = multTerms.stream().mapToInt(t -> t.readCount).sum();
		return Result.ok(new ExpressionModel.ParsedMult(totalReads, multLiteral, multTerms));
	}

	private static Result<Object, CompileError> processNonParenthesizedToken(String multToken, boolean isSubtracted,
			int position, char operator) {
		var termResult = BitwiseNotParser.parseTermWithNot(multToken);
		if (termResult instanceof Result.Err<ExpressionModel.ExpressionTerm, CompileError> err)
			return Result.err(err.error());
		var baseTerm = ((Result.Ok<ExpressionModel.ExpressionTerm, CompileError>) termResult).value();
		var flags = buildMultiplicativeFlags(baseTerm, isSubtracted, position, operator);
		return Result.ok(new ExpressionModel.ExpressionTerm(baseTerm.readCount, baseTerm.value, flags));
	}

	private static ExpressionModel.ExpressionTermFlags buildMultiplicativeFlags(ExpressionModel.ExpressionTerm baseTerm,
			boolean isSubtracted, int position, char operator) {
		return ExpressionModel.ExpressionTermFlags.empty().withSubtracted(isSubtracted)
				.withMultiplied(position > 0 && operator == '*').withDivided(position > 0 && operator == '/')
				.withBitwiseNotted(baseTerm.isBitwiseNotted()).withLogicalNotted(baseTerm.isLogicalNotted())
				.withMultiplicativeOperator(position > 0 ? operator : '\0').withReadTypeSpec(baseTerm.readTypeSpec);
	}

	private static Result<Long, CompileError> updateLiteral(long current, long value, boolean isFirst, char operator) {
		if (isFirst) {
			return Result.ok(value);
		}
		return switch (operator) {
			case '/' -> {
				if (value != 0)
					yield Result.ok(current / value);
				yield Result.ok(current);
			}
			case '&' -> Result.ok(current & value);
			case '|' -> Result.ok(current | value);
			case '^' -> Result.ok(current ^ value);
			case '<' -> Result.ok(current << value);
			case '>' -> Result.ok(current >> value);
			default -> Result.ok(current * value);
		};
	}

	private static void fixGroupingBoundaries(ArrayList<ExpressionModel.ExpressionTerm> multTerms,
			int lastExpandedParensSize,
			int multTokensSize) {
		var terms = multTerms;
		if (lastExpandedParensSize > 1 && multTokensSize > 1) {
			var lastJ0Index = lastExpandedParensSize - 1;
			if (lastJ0Index + 1 < terms.size()) {
				var nextTerm = terms.get(lastJ0Index + 1);
				if (nextTerm.isMultiplied() || nextTerm.isDivided()) {
					var termToMark = terms.get(lastJ0Index);
					terms = terms.set(lastJ0Index,
							new ExpressionModel.ExpressionTerm(termToMark.readCount, termToMark.value,
									termToMark.isSubtracted(), true));
				}
			}
		}
	}

	private static Result<ExpressionModel.ParenthesizedTokenResult, CompileError> processParenthesizedToken(
			String multToken, int position, boolean isSubtracted, int totalTokens,
			ExpressionParser expressionParser) {
		var inner = multToken.substring(1, multToken.length() - 1);
		var innerResult = expressionParser.parse(inner);
		if (innerResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> err) {
			return Result.err(err.error());
		}
		if (!(innerResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing parenthesized expression"));
		}

		var innerExpr = ok.value();
		if (position == 0) {
			return processFirstPositionParentheses(innerExpr, isSubtracted, totalTokens);
		} else {
			return processMultiplicativePositionParentheses(innerExpr, isSubtracted, multToken);
		}
	}

	private static Result<ExpressionModel.ParenthesizedTokenResult, CompileError> processFirstPositionParentheses(
			ExpressionModel.ExpressionResult innerExpr, boolean isSubtracted, int totalTokens) {
		ArrayList<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
		for (var i = 0; i < innerExpr.terms().size(); i++) {
			var innerTerm = innerExpr.terms().get(i);
			var isLastOfGroup = (i == innerExpr.terms().size() - 1) && totalTokens > 1;
			var flags = ExpressionModel.ExpressionTermFlags.empty().withSubtracted(isSubtracted)
					.withMultiplied(innerTerm.isMultiplied()).withDivided(innerTerm.isDivided())
					.withParenthesizedGroupEnd(isLastOfGroup).withBitwiseNotted(innerTerm.isBitwiseNotted())
					.withLogicalNotted(innerTerm.isLogicalNotted())
					.withMultiplicativeOperator(innerTerm.multiplicativeOperator)
					.withReadTypeSpec(innerTerm.readTypeSpec);
			terms = terms.add(new ExpressionModel.ExpressionTerm(innerTerm.readCount, innerTerm.value, flags));
		}
		return Result.ok(new ExpressionModel.ParenthesizedTokenResult(terms, innerExpr.literalValue(),
				innerExpr.terms().size()));
	}

	private static Result<ExpressionModel.ParenthesizedTokenResult, CompileError> processMultiplicativePositionParentheses(
			ExpressionModel.ExpressionResult innerExpr, boolean isSubtracted, String multToken) {
		if (innerExpr.readCount() > 1) {
			return Result.err(new CompileError(
					"Parenthesized expressions with multiple reads in multiplicative position not yet supported: "
							+ multToken));
		}
		ArrayList<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
		for (var k = 0; k < innerExpr.terms().size(); k++) {
			var innerTerm = innerExpr.terms().get(k);
			boolean isMultiplied = (k == 0);
			terms = terms.add(new ExpressionModel.ExpressionTerm(innerTerm.readCount, innerTerm.value, isSubtracted,
					isMultiplied));
		}
		return Result.ok(new ExpressionModel.ParenthesizedTokenResult(terms, innerExpr.literalValue(), 0));
	}

	private static ArrayList<ExpressionModel.MultOperatorToken> splitByMultOperators(String expr) {
		ArrayList<ExpressionModel.MultOperatorToken> result = new ArrayList<>();
		var token = new StringBuilder();
		var lastOp = '\0';
		var depth = 0;
		var e = expr;

		for (var i = 0; i < e.length(); i++) {
			var c = e.charAt(i);

			if (c == '(') {
				depth++;
				token.append(c);
			} else if (c == ')') {
				depth--;
				token.append(c);
			} else if ((c == '*' || c == '/' || c == '&' || c == '|' || c == '^') && depth == 0) {
				if ((c == '&' || c == '|') && i + 1 < e.length() && e.charAt(i + 1) == c) {
					token.append(c);
				} else {
					result = result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
					token = new StringBuilder();
					lastOp = c;
				}
			} else if ((c == '<' || c == '>') && depth == 0) {
				if (i + 1 < e.length() && e.charAt(i + 1) == c) {
					result = result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
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

		result = result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
		return result;
	}
}
