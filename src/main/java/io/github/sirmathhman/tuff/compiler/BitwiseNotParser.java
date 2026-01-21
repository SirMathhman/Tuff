package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

public final class BitwiseNotParser {
	private BitwiseNotParser() {
	}

	public static Result<ExpressionModel.ExpressionTerm, CompileError> parseTermWithNot(String term) {
		term = term.trim();

		if (term.isEmpty()) {
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}

		// Handle logical NOT (!)
		boolean isLogicalNotted = false;
		if (term.startsWith("!")) {
			isLogicalNotted = true;
			term = term.substring(1).trim();
		}

		// Handle bitwise NOT (~)
		boolean isBitwiseNotted = false;
		if (term.startsWith("~")) {
			isBitwiseNotted = true;
			term = term.substring(1).trim();
		}

		Result<ExpressionModel.ExpressionTerm, CompileError> baseResult = parseBaseTerm(term);
		if (baseResult instanceof Result.Err<ExpressionModel.ExpressionTerm, CompileError>) {
			return baseResult;
		}
		if (!(baseResult instanceof Result.Ok<ExpressionModel.ExpressionTerm, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in parseBaseTerm"));
		}
		ExpressionModel.ExpressionTerm baseTerm = ok.value();

		if (isLogicalNotted) {
			return applyLogicalNot(baseTerm, term);
		}

		if (!isBitwiseNotted) {
			return baseResult;
		}

		return applyBitwiseNot(baseTerm, term);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseBaseTerm(String term) {
		if (term.startsWith("read ")) {
			return parseReadTerm(term);
		}
		if (term.startsWith("&") || term.startsWith("*")) {
			return parsePointerTerm(term);
		}
		return parseLiteralTerm(term);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseReadTerm(String term) {
		String typeSpec = term.substring(5).trim();
		if (!typeSpec.matches("\\*?([UI]\\d+|Bool)")) {
			return Result.err(new CompileError("Invalid type specification: " + typeSpec));
		}
		return Result.ok(new ExpressionModel.ExpressionTerm(1, 0,
				new ExpressionModel.ExpressionTermFlags(false, false, false, false, false, false, false, false,
						false, '\0', typeSpec)));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parsePointerTerm(String term) {
		String inner = term.substring(1).trim();
		if (inner.startsWith("mut ")) {
			inner = inner.substring(4).trim();
		}
		return parseTermWithNot(inner);
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseLiteralTerm(String term) {
		Result<Long, CompileError> literalResult = ExpressionTokens.parseLiteral(term);
		if (literalResult instanceof Result.Err<Long, CompileError> err) {
			if (!term.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
				return Result.err(err.error());
			}
			return Result.ok(new ExpressionModel.ExpressionTerm(0, 0L, false, false));
		}
		if (!(literalResult instanceof Result.Ok<Long, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err in parseLiteral"));
		}
		return Result.ok(new ExpressionModel.ExpressionTerm(0, ok.value(), false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyBitwiseNot(
			ExpressionModel.ExpressionTerm baseTerm, String originalTerm) {
		// For read operations, set the isBitwiseNotted flag
		if (baseTerm.readCount > 0) {
			return applyUnaryOperator(baseTerm, true, false);
		}

		// For literals, compute the NOT directly
		long litValue = baseTerm.value;
		String typeSuffix = null;
		if (originalTerm.matches(".*[UI]\\d+$")) {
			typeSuffix = originalTerm.replaceAll("^.*([UI]\\d+)$", "$1");
		}
		long mask = 0xFFFFFFFFL;
		if (typeSuffix != null) {
			int bits = Integer.parseInt(typeSuffix.substring(1));
			mask = (1L << bits) - 1;
		}
		litValue = ~litValue & mask;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, litValue, false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyLogicalNot(
			ExpressionModel.ExpressionTerm baseTerm, String originalTerm) {
		// For read operations, set the isLogicalNotted flag
		if (baseTerm.readCount > 0) {
			return applyUnaryOperator(baseTerm, false, true);
		}

		// For literals, compute the NOT directly (0 -> 1, nonzero -> 0)
		long litValue = baseTerm.value;
		litValue = litValue == 0 ? 1 : 0;
		return Result.ok(new ExpressionModel.ExpressionTerm(0, litValue, false, false));
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> applyUnaryOperator(
			ExpressionModel.ExpressionTerm baseTerm, boolean isBitwiseNotted, boolean isLogicalNotted) {
		return Result.ok(new ExpressionModel.ExpressionTerm(baseTerm.readCount, baseTerm.value,
				new ExpressionModel.ExpressionTermFlags(false, false, false, false, false, false, false, isBitwiseNotted,
						isLogicalNotted, '\0', baseTerm.readTypeSpec)));
	}
}
