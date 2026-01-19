package io.github.sirmathhman.tuff;

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
				nextReg++;
			}
		}
	}

	public static int buildResultWithPrecedence(List<ExpressionModel.ExpressionTerm> terms,
			List<Instruction> instructions) {
		int readRegIndex = 0;
		int resultReg = 0;
		boolean firstAdditiveGroup = true;

		int i = 0;
		while (i < terms.size()) {
			ExpressionModel.ExpressionTerm term = terms.get(i);
			if (term.readCount == 0) {
				i++;
				continue;
			}

			// Check if this is a multiplicative term following a parenthesized group
			if (term.isMultiplied && i > 0 && terms.get(i - 1).isParenthesizedGroupEnd
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

		// Collect this multiplicative/divisive group
		java.util.List<Integer> groupRegs = new java.util.ArrayList<>();
		java.util.List<Character> groupOps = new java.util.ArrayList<>();
		groupRegs.add(readRegIndex);
		groupOps.add('\0'); // No operator for first term
		boolean isSubtracted = term.isSubtracted;
		readRegIndex++;

		// Consume all multiplied/divided terms that follow
		while (i + 1 < terms.size() && (terms.get(i + 1).isMultiplied || terms.get(i + 1).isDivided)
				&& terms.get(i + 1).readCount > 0 && !terms.get(i).isParenthesizedGroupEnd) {
			i++;
			ExpressionModel.ExpressionTerm nextTerm = terms.get(i);
			groupRegs.add(readRegIndex);
			groupOps.add(nextTerm.isDivided ? '/' : '*');
			readRegIndex++;
		}

		// Generate instructions for this group
		resultReg = processAdditiveGroup(groupRegs, groupOps, isSubtracted, firstAdditiveGroup, resultReg,
				instructions);

		boolean hasLogicalOrBoundary = term.isLogicalOrBoundary;
		boolean hasLogicalAndBoundary = term.isLogicalAndBoundary;
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
		return i + 1 < terms.size() && (terms.get(i + 1).isMultiplied || terms.get(i + 1).isDivided)
				&& terms.get(i + 1).readCount > 0;
	}

	private static int consumeAndEmitMultiplicativeTerms(List<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, int destReg, List<Instruction> instructions) {
		while (isMultiplicativeNext(terms, i)) {
			i++;
			ExpressionModel.ExpressionTerm multTerm = terms.get(i);
			instructions.add(new Instruction(
					multTerm.isDivided ? Operation.Div : Operation.Mul, Variant.Immediate, destReg,
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
			// Multiple reads: perform multiplications and divisions
			int groupResultReg = groupRegs.get(0);
			for (int j = 1; j < groupRegs.size(); j++) {
				Operation op = groupOps.get(j) == '/' ? Operation.Div : Operation.Mul;
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
