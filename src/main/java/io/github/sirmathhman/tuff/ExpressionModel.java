package io.github.sirmathhman.tuff;

import java.util.List;

public final class ExpressionModel {
	private ExpressionModel() {
	}

	public static final class ExpressionResult {
		public final int readCount;
		public final long literalValue;
		public final List<ExpressionTerm> terms;

		public ExpressionResult(int readCount, long literalValue, List<ExpressionTerm> terms) {
			this.readCount = readCount;
			this.literalValue = literalValue;
			this.terms = terms;
		}
	}

	public static final class ExpressionTerm {
		public final int readCount;
		public final long value;
		public final boolean isSubtracted;
		public final boolean isMultiplied;
		public final boolean isDivided;
		public final boolean isParenthesizedGroupEnd;

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied) {
			this(readCount, value, isSubtracted, isMultiplied, false, false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided) {
			this(readCount, value, isSubtracted, isMultiplied, isDivided, false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided,
				boolean isParenthesizedGroupEnd) {
			this.readCount = readCount;
			this.value = value;
			this.isSubtracted = isSubtracted;
			this.isMultiplied = isMultiplied;
			this.isDivided = isDivided;
			this.isParenthesizedGroupEnd = isParenthesizedGroupEnd;
		}
	}

	public record ParenthesizedTokenResult(List<ExpressionTerm> terms, long literalValue, int expandedSize) {
	}

	public static final class ParsedMult {
		public final int readCount;
		public final long literalValue;
		public final List<ExpressionTerm> terms;

		public ParsedMult(int readCount, long literalValue, List<ExpressionTerm> terms) {
			this.readCount = readCount;
			this.literalValue = literalValue;
			this.terms = terms;
		}
	}

	public static final class MultOperatorToken {
		public final String token;
		public final char operator;

		public MultOperatorToken(String token, char operator) {
			this.token = token;
			this.operator = operator;
		}
	}
}
