package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

import io.github.sirmathhman.tuff.lib.ArrayList;

public final class AdditiveExpressionParser {
	private AdditiveExpressionParser() {
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseAdditive(String expr) {
		// Split by + and - to get additive-level tokens, but not inside parentheses
		var addTokens = ExpressionTokens.splitAddOperators(expr);
		ArrayList<Boolean> additiveOps = new ArrayList<>();
		additiveOps = additiveOps.add(false);

		// Track which operator preceded each additive token
		var tokensFound = 0;
		var lastIndex = 0;
		for (var token : addTokens) {
			if (tokensFound == 0) {
				tokensFound++;
				lastIndex += token.length();
				continue;
			}
			var nextIndex = expr.indexOf(token, lastIndex);
			if (nextIndex > 0) {
				var op = expr.charAt(nextIndex - 1);
				while (Character.isWhitespace(op)) {
					nextIndex--;
					op = expr.charAt(nextIndex - 1);
				}
				additiveOps = additiveOps.add(op == '-');
			}
			lastIndex = nextIndex + token.length();
			tokensFound++;
		}

		// Process each additive token for multiplicative operators
		ArrayList<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>();
		var totalReads = 0;
		long totalLiteral = 0;

		for (var i = 0; i < addTokens.size(); i++) {
			boolean isSubtracted = additiveOps.get(i);
			var multResult = App.parseMultiplicative(
					addTokens.get(i).trim(), isSubtracted);
			if (multResult instanceof Result.Err<ExpressionModel.ParsedMult, CompileError> err) {
				return Result.err(err.error());
			}
			if (!(multResult instanceof Result.Ok<ExpressionModel.ParsedMult, CompileError> ok)) {
				return Result.err(new CompileError("Internal error: expected Ok or Err in parseMultiplicative"));
			}
			var mult = ok.value();
			allTerms = allTerms.addAll(mult.terms());
			totalReads += mult.readCount();
			if (isSubtracted) {
				totalLiteral -= mult.literalValue();
			} else {
				totalLiteral += mult.literalValue();
			}
		}

		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, totalLiteral, allTerms));
	}
}
