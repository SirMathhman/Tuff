package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import java.util.List;

public final class InstructionBuilder {
	private InstructionBuilder() {
	}

	public static void loadAllReads(List<ExpressionModel.ExpressionTerm> terms, List<Instruction> instructions) {
		int nextReg = 0;
		for (ExpressionModel.ExpressionTerm term : terms) {
			if (term.readCount > 0) {
				instructions.add(new Instruction(Operation.In, Variant.Immediate, nextReg, null));
				if (term.isBitwiseNotted()) {
					instructions.add(new Instruction(Operation.BitsNot, Variant.Immediate, nextReg, null));
				}
				if (term.isLogicalNotted()) {
					instructions.add(new Instruction(Operation.LogicalNot, Variant.Immediate, nextReg, null));
				}
				nextReg++;
			}
		}
	}

	public static int buildResultWithPrecedence(List<ExpressionModel.ExpressionTerm> terms,
			List<Instruction> instructions) {
		// Check for conditional markers
		ConditionalMarkers markers = findConditionalMarkers(terms);
		if (markers.hasConditional()) {
			return buildConditionalExpression(terms, markers, instructions);
		}

		// Check for comparison marker
		int markerIdx = findComparisonMarkerIndex(terms);
		if (markerIdx != -1) {
			return buildComparisonExpression(terms, markerIdx, instructions);
		}

		return buildSubExpressionResult(terms, 0, instructions);
	}

	private static ConditionalMarkers findConditionalMarkers(List<ExpressionModel.ExpressionTerm> terms) {
		int branchIdx = -1;
		int elseIdx = -1;
		long trueLiteral = 0;
		long falseLiteral = 0;
		for (int j = 0; j < terms.size(); j++) {
			if (terms.get(j).readCount == -3 && branchIdx == -1) {
				branchIdx = j;
				trueLiteral = terms.get(j).value;
			}
			if (terms.get(j).readCount == -4) {
				elseIdx = j;
				falseLiteral = terms.get(j).value;
				break;
			}
		}
		return new ConditionalMarkers(branchIdx, elseIdx, trueLiteral, falseLiteral);
	}

	private static int buildConditionalExpression(List<ExpressionModel.ExpressionTerm> terms,
			ConditionalMarkers markers, List<Instruction> instructions) {
		// Check if this has nested conditionals (multiple -3 markers)
		int nestedConditionalCount = 0;
		for (ExpressionModel.ExpressionTerm t : terms) {
			if (t.readCount == -3)
				nestedConditionalCount++;
		}

		if (nestedConditionalCount > 1) {
			return buildConditionalExpression(terms, markers, instructions);
		}

		List<ExpressionModel.ExpressionTerm> condTerms = terms.subList(0, markers.branchIdx);
		buildSubExpressionResult(condTerms, 0, instructions);

		final int formulaReg = 1;
		final int trueValueReg = 2;
		final int falseValueReg = 3;

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, trueValueReg, markers.trueLiteral));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, falseValueReg, markers.falseLiteral));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, formulaReg, -1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, formulaReg, 0L));

		int elseJumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) trueValueReg));

		int trueJumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		int elseBodyIdx = instructions.size();
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) falseValueReg));

		int endIdx = instructions.size();
		instructions.set(elseJumpIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, (long) formulaReg, (long) elseBodyIdx));
		instructions.set(trueJumpIdx, new Instruction(Operation.Jump, Variant.Immediate, 0, (long) endIdx));

		return 0;
	}

	private static int findComparisonMarkerIndex(List<ExpressionModel.ExpressionTerm> terms) {
		for (int j = 0; j < terms.size(); j++) {
			if (terms.get(j).readCount == -1) {
				return j;
			}
		}
		return -1;
	}

	private static int buildComparisonExpression(List<ExpressionModel.ExpressionTerm> terms, int markerIdx,
			List<Instruction> instructions) {
		ExpressionModel.ExpressionTerm marker = terms.get(markerIdx);
		List<ExpressionModel.ExpressionTerm> leftTerms = terms.subList(0, markerIdx);
		List<ExpressionModel.ExpressionTerm> rightTerms = terms.subList(markerIdx + 1, terms.size());

		int leftResult = leftTerms.isEmpty() ? -1 : buildSubExpressionResult(leftTerms, 0, instructions);
		int rightResult = rightTerms.isEmpty() ? -1
				: buildSubExpressionResult(rightTerms,
						(int) leftTerms.stream().filter(t -> t.readCount > 0).count(), instructions);

		if (leftResult != -1 && rightResult != -1) {
			boolean isInequality = marker.value == 1;
			boolean isLessThan = marker.value == 2;
			boolean isGreaterThan = marker.value == 3;
			boolean isLessOrEqual = marker.value == 4;
			boolean isGreaterOrEqual = marker.value == 5;
			generateComparisonOperation(isInequality, isLessThan, isGreaterThan, isLessOrEqual,
					isGreaterOrEqual, leftResult, rightResult, instructions);
			return leftResult;
		}
		return -1;
	}

	private static void generateComparisonOperation(boolean isInequality, boolean isLessThan,
			boolean isGreaterThan, boolean isLessOrEqual, boolean isGreaterOrEqual, int leftResult,
			int rightResult, List<Instruction> instructions) {
		if (isLessThan) {
			instructions.add(new Instruction(Operation.LessThan, Variant.Immediate, leftResult, (long) rightResult));
		} else if (isGreaterThan) {
			instructions.add(new Instruction(Operation.GreaterThan, Variant.Immediate, leftResult, (long) rightResult));
		} else if (isLessOrEqual) {
			generateCompoundComparison(leftResult, rightResult, Operation.LessThan, instructions);
		} else if (isGreaterOrEqual) {
			generateCompoundComparison(leftResult, rightResult, Operation.GreaterThan, instructions);
		} else {
			instructions.add(new Instruction(Operation.Equal, Variant.Immediate, leftResult, (long) rightResult));
			// If this is inequality, negate the result with LogicalNot
			if (isInequality) {
				instructions.add(new Instruction(Operation.LogicalNot, Variant.Immediate, leftResult, null));
			}
		}
	}

	private static void generateCompoundComparison(int leftResult, int rightResult, Operation comparisonOp,
			List<Instruction> instructions) {
		// For compound comparisons: (a op b) OR (a == b)
		int tempReg = rightResult + 1;
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, leftResult, 0L));
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, tempReg, 0L));
		instructions.add(new Instruction(comparisonOp, Variant.Immediate, tempReg, (long) rightResult));
		instructions.add(new Instruction(Operation.Equal, Variant.Immediate, leftResult, (long) rightResult));
		instructions.add(new Instruction(Operation.LogicalOr, Variant.Immediate, leftResult, (long) tempReg));
	}

	private static int buildSubExpressionResult(List<ExpressionModel.ExpressionTerm> terms, int startReg,
			List<Instruction> instructions) {
		int readRegIndex = startReg;
		int resultReg = startReg;
		boolean firstAdditiveGroup = true;

		int i = 0;
		while (i < terms.size()) {
			ExpressionModel.ExpressionTerm term = terms.get(i);
			if (term.readCount == 0 || term.readCount == -1) {
				i++;
				continue;
			}

			// Check if this is a multiplicative term following a parenthesized group
			if (term.isMultiplied() && i > 0 && terms.get(i - 1).isParenthesizedGroupEnd()
					&& !firstAdditiveGroup) {
				// Multiply the previous result by this term
				instructions.add(
						new Instruction(Operation.Mul, Variant.Immediate, resultReg, (long) readRegIndex));
				readRegIndex++;
				i++;
				continue;
			}

			// Process the current additive/multiplicative group
			ProcessGroupResult groupResult = processMultiplicativeGroup(terms, i, readRegIndex, firstAdditiveGroup,
					resultReg, instructions);
			resultReg = groupResult.resultReg;
			readRegIndex = groupResult.readRegIndex;
			i = groupResult.nextIndex;
			firstAdditiveGroup = false;

			// Check for logical AND boundary (higher precedence than OR)
			if (groupResult.hasLogicalAndBoundary) {
				ProcessAndResult andResult = processLogicalAndBoundary(terms, i, readRegIndex, resultReg,
						instructions);
				resultReg = andResult.resultReg;
				readRegIndex = andResult.readRegIndex;
				i = andResult.nextIndex;
			}

			// Check for logical OR boundary
			if (groupResult.hasLogicalOrBoundary) {
				ProcessOrResult orResult = processLogicalOrBoundary(terms, i, readRegIndex, resultReg,
						instructions);
				resultReg = orResult.resultReg;
				readRegIndex = orResult.readRegIndex;
				i = orResult.nextIndex;
			}

			i++;
		}

		return resultReg;
	}

	private static ProcessGroupResult processMultiplicativeGroup(List<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, boolean firstAdditiveGroup, int resultReg, List<Instruction> instructions) {
		ExpressionModel.ExpressionTerm term = terms.get(i);

		// Collect this multiplicative/divisive/bitwise group
		java.util.List<Integer> groupRegs = new java.util.ArrayList<>();
		java.util.List<Character> groupOps = new java.util.ArrayList<>();
		groupRegs.add(readRegIndex);
		groupOps.add('\0'); // No operator for first term
		boolean isSubtracted = term.isSubtracted();
		readRegIndex++;

		// Consume all multiplied/divided/bitwise-anded terms that follow
		while (isMultiplicativeNext(terms, i) && !terms.get(i).isParenthesizedGroupEnd()) {
			i++;
			ExpressionModel.ExpressionTerm nextTerm = terms.get(i);
			groupRegs.add(readRegIndex);
			// Use the actual operator char stored in the term
			char op = nextTerm.multiplicativeOperator;
			if (op == '\0') {
				// No operator stored - infer from flags (backward compatibility)
				op = nextTerm.isDivided() ? '/' : '*';
			}
			groupOps.add(op);
			readRegIndex++;
		}

		// Generate instructions for this group
		resultReg = processAdditiveGroup(groupRegs, groupOps, isSubtracted, firstAdditiveGroup, resultReg,
				instructions);

		boolean hasLogicalOrBoundary = term.isLogicalOrBoundary();
		boolean hasLogicalAndBoundary = term.isLogicalAndBoundary();
		return new ProcessGroupResult(resultReg, readRegIndex, i, hasLogicalOrBoundary, hasLogicalAndBoundary);
	}

	private static ProcessOrResult processLogicalOrBoundary(List<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, int resultReg, List<Instruction> instructions) {
		return processLogicalBoundary(terms, i, readRegIndex, resultReg, instructions, Operation.LogicalOr);
	}

	private static ProcessAndResult processLogicalAndBoundary(List<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, int resultReg, List<Instruction> instructions) {
		ProcessOrResult result = processLogicalBoundary(terms, i, readRegIndex, resultReg, instructions,
				Operation.LogicalAnd);
		return new ProcessAndResult(result.resultReg, result.readRegIndex, result.nextIndex);
	}

	private static ProcessOrResult processLogicalBoundary(List<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, int resultReg, List<Instruction> instructions, Operation logicalOp) {
		i++;
		while (i < terms.size() && terms.get(i).readCount == 0) {
			i++;
		}

		if (i < terms.size()) {
			int nextGroupReg = readRegIndex;
			readRegIndex++;

			// Consume multiplicative/divisive terms and generate instructions
			readRegIndex = consumeAndEmitMultiplicativeTerms(terms, i, readRegIndex, nextGroupReg, instructions);
			i = findLastMultiplicativeTermIndex(terms, i);

			// Perform logical operation (OR or AND)
			instructions.add(new Instruction(logicalOp, Variant.Immediate, resultReg, (long) nextGroupReg));
		}

		return new ProcessOrResult(resultReg, readRegIndex, i);
	}

	private static boolean isMultiplicativeNext(List<ExpressionModel.ExpressionTerm> terms, int i) {
		return i + 1 < terms.size()
				&& (terms.get(i + 1).isMultiplied() || terms.get(i + 1).isDivided()
						|| terms.get(i + 1).multiplicativeOperator == '&' || terms.get(i + 1).multiplicativeOperator == '|'
						|| terms.get(i + 1).multiplicativeOperator == '^' || terms.get(i + 1).multiplicativeOperator == '<'
						|| terms.get(i + 1).multiplicativeOperator == '>')
				&& terms.get(i + 1).readCount > 0;
	}

	private static int consumeAndEmitMultiplicativeTerms(List<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, int destReg, List<Instruction> instructions) {
		while (isMultiplicativeNext(terms, i)) {
			i++;
			ExpressionModel.ExpressionTerm multTerm = terms.get(i);
			instructions.add(new Instruction(
					multTerm.isDivided() ? Operation.Div : Operation.Mul, Variant.Immediate, destReg,
					(long) readRegIndex));
			readRegIndex++;
		}
		return readRegIndex;
	}

	private static int findLastMultiplicativeTermIndex(List<ExpressionModel.ExpressionTerm> terms, int i) {
		while (isMultiplicativeNext(terms, i)) {
			i++;
		}
		return i;
	}

	private record ProcessGroupResult(int resultReg, int readRegIndex, int nextIndex, boolean hasLogicalOrBoundary,
			boolean hasLogicalAndBoundary) {
	}

	private record ProcessOrResult(int resultReg, int readRegIndex, int nextIndex) {
	}

	private record ProcessAndResult(int resultReg, int readRegIndex, int nextIndex) {
	}

	private record ConditionalMarkers(int branchIdx, int elseIdx, long trueLiteral, long falseLiteral) {
		boolean hasConditional() {
			return branchIdx != -1 && elseIdx != -1;
		}
	}

	private static int processAdditiveGroup(java.util.List<Integer> groupRegs, java.util.List<Character> groupOps,
			boolean isSubtracted,
			boolean firstAdditiveGroup, int resultReg, List<Instruction> instructions) {
		if (groupRegs.size() == 1) {
			// Single read in this group
			if (firstAdditiveGroup) {
				return groupRegs.get(0);
			} else {
				// Add or subtract to result
				Operation op = isSubtracted ? Operation.Sub : Operation.Add;
				instructions.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupRegs.get(0)));
				return resultReg;
			}
		} else {
			// Multiple reads: perform multiplications, divisions, and bitwise operations
			int groupResultReg = groupRegs.get(0);
			for (int j = 1; j < groupRegs.size(); j++) {
				Operation op = switch (groupOps.get(j)) {
					case '/' -> Operation.Div;
					case '&' -> Operation.BitsAnd;
					case '|' -> Operation.BitsOr;
					case '^' -> Operation.BitsXor;
					case '<' -> Operation.BitsShiftLeft;
					case '>' -> Operation.BitsShiftRight;
					default -> Operation.Mul;
				};
				instructions.add(new Instruction(op, Variant.Immediate, groupResultReg, (long) groupRegs.get(j)));
			}

			// Add/subtract this group's result to overall result
			if (firstAdditiveGroup) {
				return groupResultReg;
			} else {
				Operation op = isSubtracted ? Operation.Sub : Operation.Add;
				instructions.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupResultReg));
				return resultReg;
			}
		}
	}

	public static void addLiteralToResult(int resultReg, long literalValue, int termCount,
			List<Instruction> instructions) {
		// Count how many reads we have to determine next register
		int literalReg = 0;
		for (Instruction inst : instructions) {
			if (inst.operation() == Operation.In) {
				literalReg++;
			}
		}
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, literalReg, literalValue));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, resultReg, (long) literalReg));
	}
}
