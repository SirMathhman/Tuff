package io.github.sirmathhman.tuff.compiler;

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
		private final AdditiveOp additiveOp;
		private final MultiplicativeOp multiplicativeOp;
		private final GroupEnd groupEnd;
		private final Dereference dereference;
		private final LogicalBoundary logicalBoundary;

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied) {
			this(readCount, value, isSubtracted, isMultiplied, false, false, false, false, false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided) {
			this(readCount, value, isSubtracted, isMultiplied, isDivided, false, false, false, false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided,
				boolean isParenthesizedGroupEnd) {
			this(readCount, value, isSubtracted, isMultiplied, isDivided, isParenthesizedGroupEnd, false, false, false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided,
				boolean isParenthesizedGroupEnd, boolean isDereferenced) {
			this(readCount, value, isSubtracted, isMultiplied, isDivided, isParenthesizedGroupEnd, isDereferenced, false,
					false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided,
				boolean isParenthesizedGroupEnd, boolean isDereferenced, boolean isLogicalOrBoundary) {
			this(readCount, value, isSubtracted, isMultiplied, isDivided, isParenthesizedGroupEnd, isDereferenced,
					isLogicalOrBoundary, false);
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided,
				boolean isParenthesizedGroupEnd, boolean isDereferenced, boolean isLogicalOrBoundary,
				boolean isLogicalAndBoundary) {
			this.readCount = readCount;
			this.value = value;
			this.additiveOp = AdditiveOp.from(isSubtracted);
			this.multiplicativeOp = MultiplicativeOp.from(isMultiplied, isDivided);
			this.groupEnd = GroupEnd.from(isParenthesizedGroupEnd);
			this.dereference = Dereference.from(isDereferenced);
			this.logicalBoundary = LogicalBoundary.from(isLogicalOrBoundary, isLogicalAndBoundary);
		}

		public boolean isSubtracted() {
			return additiveOp == AdditiveOp.Subtract;
		}

		public boolean isMultiplied() {
			return multiplicativeOp == MultiplicativeOp.Multiply;
		}

		public boolean isDivided() {
			return multiplicativeOp == MultiplicativeOp.Divide;
		}

		public boolean isParenthesizedGroupEnd() {
			return groupEnd == GroupEnd.ParenthesizedGroupEnd;
		}

		public boolean isDereferenced() {
			return dereference == Dereference.Dereferenced;
		}

		public boolean isLogicalOrBoundary() {
			return logicalBoundary.hasOr;
		}

		public boolean isLogicalAndBoundary() {
			return logicalBoundary.hasAnd;
		}

		public ExpressionTerm withLogicalBoundary(boolean hasOrBoundary, boolean hasAndBoundary) {
			return new ExpressionTerm(readCount, value, isSubtracted(),
					isMultiplied(), isDivided(), isParenthesizedGroupEnd(), isDereferenced(), hasOrBoundary, hasAndBoundary);
		}
	}

	public enum AdditiveOp {
		Add,
		Subtract;

		private static AdditiveOp from(boolean isSubtracted) {
			return isSubtracted ? Subtract : Add;
		}
	}

	public enum MultiplicativeOp {
		None,
		Multiply,
		Divide;

		private static MultiplicativeOp from(boolean isMultiplied, boolean isDivided) {
			if (isDivided) {
				return Divide;
			}
			if (isMultiplied) {
				return Multiply;
			}
			return None;
		}
	}

	public enum GroupEnd {
		None,
		ParenthesizedGroupEnd;

		private static GroupEnd from(boolean isParenthesizedGroupEnd) {
			return isParenthesizedGroupEnd ? ParenthesizedGroupEnd : None;
		}
	}

	public enum Dereference {
		Direct,
		Dereferenced;

		private static Dereference from(boolean isDereferenced) {
			return isDereferenced ? Dereferenced : Direct;
		}
	}

	public enum LogicalBoundary {
		None(false, false),
		Or(true, false),
		And(false, true),
		OrAnd(true, true);

		private final boolean hasOr;
		private final boolean hasAnd;

		LogicalBoundary(boolean hasOr, boolean hasAnd) {
			this.hasOr = hasOr;
			this.hasAnd = hasAnd;
		}

		private static LogicalBoundary from(boolean hasOr, boolean hasAnd) {
			if (hasOr && hasAnd) {
				return OrAnd;
			}
			if (hasOr) {
				return Or;
			}
			if (hasAnd) {
				return And;
			}
			return None;
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
