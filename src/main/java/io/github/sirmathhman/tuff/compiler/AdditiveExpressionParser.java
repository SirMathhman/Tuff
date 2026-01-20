package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import java.util.ArrayList;
import java.util.List;

public final class AdditiveExpressionParser {
	private AdditiveExpressionParser() {
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseAdditive(String expr) {
		// Split by + and - to get additive-level tokens, but not inside parentheses
		List<String> addTokens = ExpressionTokens.splitAddOperators(expr);
		List<Boolean> additiveOps = new ArrayList<>();
		additiveOps.add(false);

		// Track which operator preceded each additive token
		int tokensFound = 0;
		int lastIndex = 0;
		for (String token : addTokens) {
			if (tokensFound == 0) {
				tokensFound++;
				lastIndex += token.length();
				continue;
			}
			int nextIndex = expr.indexOf(token, lastIndex);
			if (nextIndex > 0) {
				char op = expr.charAt(nextIndex - 1);
				while (nextIndex > 0 && Character.isWhitespace(op)) {
					nextIndex--;
					op = expr.charAt(nextIndex - 1);
				}
				additiveOps.add(op == '-');
			}
			lastIndex = nextIndex + token.length();
			tokensFound++;
		}

		// Process each additive token for multiplicative operators
		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>();
		int totalReads = 0;
		long totalLiteral = 0;

		for (int i = 0; i < addTokens.size(); i++) {
			boolean isSubtracted = additiveOps.get(i);
			Result<ExpressionModel.ParsedMult, CompileError> multResult = App.parseMultiplicative(
					addTokens.get(i).trim(), isSubtracted);
			if (multResult instanceof Result.Err<ExpressionModel.ParsedMult, CompileError> err) {
				return Result.err(err.error());
			}
			if (!(multResult instanceof Result.Ok<ExpressionModel.ParsedMult, CompileError> ok)) {
				return Result.err(new CompileError("Internal error: expected Ok or Err in parseMultiplicative"));
			}
			ExpressionModel.ParsedMult mult = ok.value();
			allTerms.addAll(mult.terms);
			totalReads += mult.readCount;
			if (isSubtracted) {
				totalLiteral -= mult.literalValue;
			} else {
				totalLiteral += mult.literalValue;
			}
		}

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
