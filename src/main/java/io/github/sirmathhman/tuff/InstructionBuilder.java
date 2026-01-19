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
			if (term.isMultiplied && i > 0 && terms.get(i - 1).isParenthesizedGroupEnd && !firstAdditiveGroup) {
				// Multiply the previous result by this term
				instructions.add(new Instruction(Operation.Mul, Variant.Immediate, resultReg, (long) readRegIndex));
				readRegIndex++;
				i++;
				continue;
			}

			// Collect this multiplicative/divisive group
			java.util.List<Integer> groupRegs = new java.util.ArrayList<>();
			java.util.List<Character> groupOps = new java.util.ArrayList<>();
			groupRegs.add(readRegIndex);
			groupOps.add('\0'); // No operator for first term
			boolean isSubtracted = term.isSubtracted;
			readRegIndex++;

			// Consume all multiplied/divided terms that follow
			// But stop if the current term is a parenthesized group end
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
			firstAdditiveGroup = false;

			i++;
		}

		return resultReg;
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
