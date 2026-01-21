package io.github.sirmathhman.tuff.compiler;

import java.util.List;

public final class ExpressionModel {
	private ExpressionModel() {
	}

	public record ExpressionTermFlags(long markerValue, char multiplicativeOperator, String readTypeSpec) {
		private static final long SUBTRACTED = 1L << 0;
		private static final long MULTIPLIED = 1L << 1;
		private static final long DIVIDED = 1L << 2;
		private static final long PAREN_GROUP_END = 1L << 3;
		private static final long DEREFERENCED = 1L << 4;
		private static final long LOGICAL_OR_BOUNDARY = 1L << 5;
		private static final long LOGICAL_AND_BOUNDARY = 1L << 6;
		private static final long BITWISE_NOTTED = 1L << 7;
		private static final long LOGICAL_NOTTED = 1L << 8;

		static long setBit(long markerValue, long bit, boolean enabled) {
			return enabled ? (markerValue | bit) : (markerValue & ~bit);
		}

		public boolean isSubtracted() {
			return (markerValue & SUBTRACTED) != 0;
		}

		public boolean isMultiplied() {
			return (markerValue & MULTIPLIED) != 0;
		}

		public boolean isDivided() {
			return (markerValue & DIVIDED) != 0;
		}

		public boolean isParenthesizedGroupEnd() {
			return (markerValue & PAREN_GROUP_END) != 0;
		}

		public boolean isDereferenced() {
			return (markerValue & DEREFERENCED) != 0;
		}

		public boolean isLogicalOrBoundary() {
			return (markerValue & LOGICAL_OR_BOUNDARY) != 0;
		}

		public boolean isLogicalAndBoundary() {
			return (markerValue & LOGICAL_AND_BOUNDARY) != 0;
		}

		public boolean isBitwiseNotted() {
			return (markerValue & BITWISE_NOTTED) != 0;
		}

		public boolean isLogicalNotted() {
			return (markerValue & LOGICAL_NOTTED) != 0;
		}

		public static ExpressionTermFlags empty() {
			return new ExpressionTermFlags(0L, '\0', null);
		}

		public ExpressionTermFlags withSubtracted(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, SUBTRACTED, enabled), multiplicativeOperator, readTypeSpec);
		}

		public ExpressionTermFlags withMultiplied(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, MULTIPLIED, enabled), multiplicativeOperator, readTypeSpec);
		}

		public ExpressionTermFlags withDivided(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, DIVIDED, enabled), multiplicativeOperator, readTypeSpec);
		}

		public ExpressionTermFlags withParenthesizedGroupEnd(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, PAREN_GROUP_END, enabled), multiplicativeOperator,
					readTypeSpec);
		}

		public ExpressionTermFlags withDereferenced(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, DEREFERENCED, enabled), multiplicativeOperator, readTypeSpec);
		}

		public ExpressionTermFlags withLogicalOrBoundary(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, LOGICAL_OR_BOUNDARY, enabled), multiplicativeOperator,
					readTypeSpec);
		}

		public ExpressionTermFlags withLogicalAndBoundary(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, LOGICAL_AND_BOUNDARY, enabled), multiplicativeOperator,
					readTypeSpec);
		}

		public ExpressionTermFlags withBitwiseNotted(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, BITWISE_NOTTED, enabled), multiplicativeOperator,
					readTypeSpec);
		}

		public ExpressionTermFlags withLogicalNotted(boolean enabled) {
			return new ExpressionTermFlags(setBit(markerValue, LOGICAL_NOTTED, enabled), multiplicativeOperator,
					readTypeSpec);
		}

		public ExpressionTermFlags withMultiplicativeOperator(char op) {
			return new ExpressionTermFlags(markerValue, op, readTypeSpec);
		}

		public ExpressionTermFlags withReadTypeSpec(String spec) {
			return new ExpressionTermFlags(markerValue, multiplicativeOperator, spec);
		}
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
		private final BitwiseNot bitwiseNot;
		private final LogicalNot logicalNot;
		private final LogicalBoundary logicalBoundary;
		public final char multiplicativeOperator;
		public final String readTypeSpec;

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied) {
			this(readCount, value,
					new ExpressionTermFlags(markerForArithmetic(isSubtracted, isMultiplied, false), '\0', null));
		}

		public ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied, boolean isDivided) {
			this(readCount, value,
					new ExpressionTermFlags(markerForArithmetic(isSubtracted, isMultiplied, isDivided), '\0', null));
		}

		private static long markerForArithmetic(boolean isSubtracted, boolean isMultiplied, boolean isDivided) {
			long markerValue = 0;
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.SUBTRACTED, isSubtracted);
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.MULTIPLIED, isMultiplied);
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.DIVIDED, isDivided);
			return markerValue;
		}

		public ExpressionTerm(int readCount, long value, ExpressionTermFlags flags) {
			this.readCount = readCount;
			this.value = value;
			this.additiveOp = AdditiveOp.from(flags.isSubtracted());
			this.multiplicativeOp = MultiplicativeOp.from(flags.isMultiplied(), flags.isDivided());
			this.groupEnd = GroupEnd.from(flags.isParenthesizedGroupEnd());
			this.dereference = Dereference.from(flags.isDereferenced());
			this.bitwiseNot = BitwiseNot.from(flags.isBitwiseNotted());
			this.logicalNot = LogicalNot.from(flags.isLogicalNotted());
			this.logicalBoundary = LogicalBoundary.from(flags.isLogicalOrBoundary(), flags.isLogicalAndBoundary());
			this.multiplicativeOperator = flags.multiplicativeOperator();
			this.readTypeSpec = flags.readTypeSpec();
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

		public boolean isBitwiseAnd() {
			return multiplicativeOp == MultiplicativeOp.BitwiseAnd;
		}

		public boolean isParenthesizedGroupEnd() {
			return groupEnd == GroupEnd.ParenthesizedGroupEnd;
		}

		public boolean isDereferenced() {
			return dereference == Dereference.Dereferenced;
		}

		public boolean isBitwiseNotted() {
			return bitwiseNot == BitwiseNot.Notted;
		}

		public boolean isLogicalNotted() {
			return logicalNot == LogicalNot.Notted;
		}

		public boolean isLogicalOrBoundary() {
			return logicalBoundary.hasOr;
		}

		public boolean isLogicalAndBoundary() {
			return logicalBoundary.hasAnd;
		}

		public ExpressionTerm withLogicalBoundary(boolean hasOrBoundary, boolean hasAndBoundary) {
			long markerValue = 0;
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.SUBTRACTED, isSubtracted());
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.MULTIPLIED, isMultiplied());
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.DIVIDED, isDivided());
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.PAREN_GROUP_END,
					isParenthesizedGroupEnd());
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.DEREFERENCED, isDereferenced());
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.LOGICAL_OR_BOUNDARY, hasOrBoundary);
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.LOGICAL_AND_BOUNDARY, hasAndBoundary);
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.BITWISE_NOTTED, isBitwiseNotted());
			markerValue = ExpressionTermFlags.setBit(markerValue, ExpressionTermFlags.LOGICAL_NOTTED, isLogicalNotted());
			return new ExpressionTerm(readCount, value,
					new ExpressionTermFlags(markerValue, multiplicativeOperator, readTypeSpec));
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
		Divide,
		BitwiseAnd,
		BitwiseOr;

		private static MultiplicativeOp from(boolean isMultiplied, boolean isDivided) {
			if (isDivided) {
				return Divide;
			}
			if (isMultiplied) {
				return Multiply;
			}
			return None;
		}

		public static MultiplicativeOp fromOperator(char op) {
			return switch (op) {
				case '*' -> Multiply;
				case '/' -> Divide;
				case '&' -> BitwiseAnd;
				case '|' -> BitwiseOr;
				default -> None;
			};
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

	public enum BitwiseNot {
		None,
		Notted;

		private static BitwiseNot from(boolean isBitwiseNotted) {
			return isBitwiseNotted ? Notted : None;
		}
	}

	public enum LogicalNot {
		None,
		Notted;

		private static LogicalNot from(boolean isLogicalNotted) {
			return isLogicalNotted ? Notted : None;
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
