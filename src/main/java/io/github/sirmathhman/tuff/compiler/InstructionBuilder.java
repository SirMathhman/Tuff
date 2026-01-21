package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.lib.ArrayList;

public final class InstructionBuilder {
	private InstructionBuilder() {
	}

	private record BuildContext(ArrayList<ExpressionModel.ExpressionTerm> terms, ArrayList<Instruction> instructions) {
	}

	public static ArrayList<Instruction> loadAllReads(ArrayList<ExpressionModel.ExpressionTerm> terms,
			ArrayList<Instruction> instructions) {
		var nextReg = 0;
		var instr = instructions;
		for (var term : terms) {
			if (term.readCount > 0) {
				instr = instr.add(new Instruction(Operation.In, Variant.Immediate, nextReg, null));
				if (term.isBitwiseNotted()) {
					instr = instr.add(new Instruction(Operation.BitsNot, Variant.Immediate, nextReg, null));
				}
				if (term.isLogicalNotted()) {
					instr = instr.add(new Instruction(Operation.LogicalNot, Variant.Immediate, nextReg, null));
				}
				nextReg++;
			}
		}
		return instr;
	}

	public static int buildResultWithPrecedence(ArrayList<ExpressionModel.ExpressionTerm> terms,
			ArrayList<Instruction> instructions) {
		// Check for conditional markers
		var markers = findConditionalMarkers(terms);
		if (markers.hasConditional()) {
			return buildConditionalExpression(terms, markers, instructions);
		}

		// Check for type-check marker (is operator)
		var typeCheckIdx = findTypeCheckMarkerIndex(terms);
		if (typeCheckIdx != -1) {
			return buildTypeCheckExpression(terms, typeCheckIdx, instructions);
		}

		// Check for comparison marker
		var markerIdx = findComparisonMarkerIndex(terms);
		if (markerIdx != -1) {
			return buildComparisonExpression(terms, markerIdx, instructions);
		}

		return buildSubExpressionResult(terms, 0, instructions);
	}

	private static ConditionalMarkers findConditionalMarkers(ArrayList<ExpressionModel.ExpressionTerm> terms) {
		var branchIdx = -1;
		var elseIdx = -1;
		long trueLiteral = 0;
		long falseLiteral = 0;
		for (var j = 0; j < terms.size(); j++) {
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

	@SuppressWarnings("CheckReturnValue")
	private static int buildConditionalExpression(ArrayList<ExpressionModel.ExpressionTerm> terms,
			ConditionalMarkers markers, ArrayList<Instruction> instructions) {
		var instr = instructions;
		// Check if this has nested conditionals (multiple -3 markers)
		var nestedConditionalCount = 0;
		for (var t : terms) {
			if (t.readCount == -3)
				nestedConditionalCount++;
		}

		if (nestedConditionalCount > 1) {
			return buildConditionalExpression(terms, markers, instr);
		}

		var condTerms = terms.subList(0, markers.branchIdx);
		// If the condition is a literal-only value (e.g., true/false), load it
		// directly.
		if (!(condTerms.size() == 1 && condTerms.get(0).readCount == 0
				&& !condTerms.get(0).isMultiplied() && !condTerms.get(0).isDivided())) {
			buildResultWithPrecedence(condTerms, instr);
		} else {
			instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, 0, condTerms.get(0).value));
		}

		final var formulaReg = 1;
		final var trueValueReg = 2;
		final var falseValueReg = 3;

		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, trueValueReg, markers.trueLiteral));
		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, falseValueReg, markers.falseLiteral));
		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, formulaReg, -1L));
		instr = instr.add(new Instruction(Operation.Add, Variant.Immediate, formulaReg, 0L));

		var elseJumpIdx = instr.size();
		instr = instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L));
		instr = instr.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) trueValueReg));

		var trueJumpIdx = instr.size();
		instr = instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		var elseBodyIdx = instr.size();
		instr.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L))
				.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) falseValueReg));

		var endIdx = instr.size();
		instr.set(elseJumpIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, (long) formulaReg, (long) elseBodyIdx));
		instr.set(trueJumpIdx, new Instruction(Operation.Jump, Variant.Immediate, 0, (long) endIdx));

		return 0;
	}

	private static int findComparisonMarkerIndex(ArrayList<ExpressionModel.ExpressionTerm> terms) {
		for (var j = 0; j < terms.size(); j++) {
			if (terms.get(j).readCount == -1) {
				return j;
			}
		}
		return -1;
	}

	private static int findTypeCheckMarkerIndex(ArrayList<ExpressionModel.ExpressionTerm> terms) {
		for (var j = 0; j < terms.size(); j++) {
			if (terms.get(j).readCount == -5) {
				return j;
			}
		}
		return -1;
	}

	private static int buildComparisonExpression(ArrayList<ExpressionModel.ExpressionTerm> terms, int markerIdx,
			ArrayList<Instruction> instructions) {
		var marker = terms.get(markerIdx);
		var leftTerms = terms.subList(0, markerIdx);
		var rightTerms = terms.subList(markerIdx + 1, terms.size());

		int leftResult;
		if (leftTerms.isEmpty())
			leftResult = -1;
		else
			leftResult = buildSubExpressionResult(leftTerms, 0, instructions);
		int rightResult;
		if (rightTerms.isEmpty())
			rightResult = -1;
		else
			rightResult = buildSubExpressionResult(rightTerms,
					(int) leftTerms.stream().filter(t -> t.readCount > 0).count(),
					instructions);

		if (leftResult != -1 && rightResult != -1) {
			generateComparisonOperation(marker.value, leftResult, rightResult, instructions);
			return leftResult;
		}
		return -1;
	}

	private static void generateComparisonOperation(long markerValue, int leftResult,
			int rightResult, ArrayList<Instruction> instructions) {
		var isInequality = markerValue == 1;
		var isLessThan = markerValue == 2;
		var isGreaterThan = markerValue == 3;
		var isLessOrEqual = markerValue == 4;
		var isGreaterOrEqual = markerValue == 5;

		var instr = instructions;
		if (isLessThan) {
			instr = instr.add(new Instruction(Operation.LessThan, Variant.Immediate, leftResult, (long) rightResult));
		} else if (isGreaterThan) {
			instr = instr.add(new Instruction(Operation.GreaterThan, Variant.Immediate, leftResult, (long) rightResult));
		} else if (isLessOrEqual) {
			generateCompoundComparison(leftResult, rightResult, Operation.LessThan, instructions);
		} else if (isGreaterOrEqual) {
			generateCompoundComparison(leftResult, rightResult, Operation.GreaterThan, instructions);
		} else {
			instr = instr.add(new Instruction(Operation.Equal, Variant.Immediate, leftResult, (long) rightResult));
			// If this is inequality, negate the result with LogicalNot
			if (isInequality) {
				instr = instr.add(new Instruction(Operation.LogicalNot, Variant.Immediate, leftResult, null));
			}
		}
	}

	@SuppressWarnings("CheckReturnValue")
	private static void generateCompoundComparison(int leftResult, int rightResult, Operation comparisonOp,
			ArrayList<Instruction> instructions) {
		// For compound comparisons: (a op b) OR (a == b)
		var tempReg = rightResult + 1;
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, leftResult, 0L))
				.add(new Instruction(Operation.Load, Variant.DirectAddress, tempReg, 0L))
				.add(new Instruction(comparisonOp, Variant.Immediate, tempReg, (long) rightResult))
				.add(new Instruction(Operation.Equal, Variant.Immediate, leftResult, (long) rightResult))
				.add(new Instruction(Operation.LogicalOr, Variant.Immediate, leftResult, (long) tempReg));
	}

	@SuppressWarnings("CheckReturnValue")
	private static int buildTypeCheckExpression(ArrayList<ExpressionModel.ExpressionTerm> terms, int markerIdx,
			ArrayList<Instruction> instructions) {
		var instr = instructions;
		var valueTerms = terms.subList(0, markerIdx);

		int valueResult;
		if (valueTerms.isEmpty())
			valueResult = -1;
		else
			valueResult = buildSubExpressionResult(valueTerms, 0, instr);

		if (valueResult != -1) {
			// For now, always return 1 (true) as type check result
			// In a full implementation, we'd use the marker's readTypeSpec to check at
			// runtime
			instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, valueResult, 1L));
			return valueResult;
		}
		return -1;
	}

	private static int buildSubExpressionResult(ArrayList<ExpressionModel.ExpressionTerm> terms, int startReg,
			ArrayList<Instruction> instructions) {
		var ctx = new BuildContext(terms, instructions);
		var regIdx = startReg;
		var resReg = startReg;
		var firstAdditiveGroup = true;

		var idx = 0;
		while (idx < terms.size()) {
			var term = terms.get(idx);
			if (term.readCount == 0 || term.readCount == -1) {
				idx++;
				continue;
			}

			// Check if this is a multiplicative term following a parenthesized group
			if (term.isMultiplied() && idx > 0 && terms.get(idx - 1).isParenthesizedGroupEnd()
					&& !firstAdditiveGroup) {
				// Multiply the previous result by this term
				@SuppressWarnings("CheckReturnValue")
				var unused = instructions.add(
						new Instruction(Operation.Mul, Variant.Immediate, resReg, (long) regIdx));
				regIdx++;
				idx++;
				continue;
			}

			// Process the current additive/multiplicative group
			var groupResult = processMultiplicativeGroup(ctx, idx, regIdx, firstAdditiveGroup,
					resReg);
			resReg = groupResult.resultReg;
			regIdx = groupResult.readRegIndex;
			idx = groupResult.nextIndex;
			firstAdditiveGroup = false;

			// Check for logical AND boundary (higher precedence than OR)
			if (groupResult.hasLogicalAndBoundary) {
				var andResult = processLogicalAndBoundary(ctx, idx, regIdx, resReg);
				resReg = andResult.resultReg;
				regIdx = andResult.readRegIndex;
				idx = andResult.nextIndex;
			}

			// Check for logical OR boundary
			if (groupResult.hasLogicalOrBoundary) {
				var orResult = processLogicalOrBoundary(ctx, idx, regIdx, resReg);
				resReg = orResult.resultReg;
				regIdx = orResult.readRegIndex;
				idx = orResult.nextIndex;
			}

			idx++;
		}

		return resReg;
	}

	private static ProcessGroupResult processMultiplicativeGroup(BuildContext ctx, int i,
			int readRegIndex, boolean firstAdditiveGroup, int resultReg) {
		var regIdx = readRegIndex;
		var terms = ctx.terms();
		var instructions = ctx.instructions();
		var term = terms.get(i);

		// Collect this multiplicative/divisive/bitwise group
		ArrayList<Integer> groupRegs = new ArrayList<>();
		ArrayList<Character> groupOps = new ArrayList<>();
		groupRegs = groupRegs.add(regIdx);
		groupOps = groupOps.add('\0'); // No operator for first term
		var isSubtracted = term.isSubtracted();
		regIdx++;
		var idx = i;

		// Consume all multiplied/divided/bitwise-anded terms that follow
		while (isMultiplicativeNext(terms, idx) && !terms.get(idx).isParenthesizedGroupEnd()) {
			idx++;
			var nextTerm = terms.get(idx);
			groupRegs = groupRegs.add(regIdx);
			// Use the actual operator char stored in the term
			var op = nextTerm.multiplicativeOperator;
			if (op == '\0') {
				// No operator stored - infer from flags (backward compatibility)
				if (nextTerm.isDivided())
					op = '/';
				else
					op = '*';
			}
			groupOps = groupOps.add(op);
			regIdx++;
		}

		// Generate instructions for this group
		var resReg = processAdditiveGroup(groupRegs, groupOps, isSubtracted,
				new AdditiveGroupState(firstAdditiveGroup, resultReg, instructions));

		var hasLogicalOrBoundary = term.isLogicalOrBoundary();
		var hasLogicalAndBoundary = term.isLogicalAndBoundary();
		return new ProcessGroupResult(resReg, regIdx, idx, hasLogicalOrBoundary, hasLogicalAndBoundary);
	}

	private static ProcessOrResult processLogicalOrBoundary(BuildContext ctx, int i,
			int readRegIndex, int resultReg) {
		return processLogicalBoundary(ctx, i, readRegIndex, resultReg, Operation.LogicalOr);
	}

	private static ProcessAndResult processLogicalAndBoundary(BuildContext ctx, int i,
			int readRegIndex, int resultReg) {
		var result = processLogicalBoundary(ctx, i, readRegIndex, resultReg, Operation.LogicalAnd);
		return new ProcessAndResult(result.resultReg, result.readRegIndex, result.nextIndex);
	}

	private static ProcessOrResult processLogicalBoundary(BuildContext ctx, int i,
			int readRegIndex, int resultReg, Operation logicalOp) {
		var idx = i;
		var regIdx = readRegIndex;
		var terms = ctx.terms();
		var instructions = ctx.instructions();
		do {
			idx++;
		} while (idx < terms.size() && terms.get(idx).readCount == 0);

		if (idx < terms.size()) {
			var nextGroupReg = regIdx;
			regIdx++;

			// Consume multiplicative/divisive terms and generate instructions
			regIdx = consumeAndEmitMultiplicativeTerms(terms, idx, regIdx, nextGroupReg, instructions);
			idx = findLastMultiplicativeTermIndex(terms, idx);

			// Perform logical operation (OR or AND)
			@SuppressWarnings("CheckReturnValue")
			var unused = instructions.add(new Instruction(logicalOp, Variant.Immediate, resultReg, (long) nextGroupReg));
		}

		return new ProcessOrResult(resultReg, regIdx, idx);
	}

	private static boolean isMultiplicativeNext(ArrayList<ExpressionModel.ExpressionTerm> terms, int i) {
		return i + 1 < terms.size()
				&& (terms.get(i + 1).isMultiplied() || terms.get(i + 1).isDivided()
						|| terms.get(i + 1).multiplicativeOperator == '&' || terms.get(i + 1).multiplicativeOperator == '|'
						|| terms.get(i + 1).multiplicativeOperator == '^' || terms.get(i + 1).multiplicativeOperator == '<'
						|| terms.get(i + 1).multiplicativeOperator == '>')
				&& terms.get(i + 1).readCount > 0;
	}

	private static int consumeAndEmitMultiplicativeTerms(ArrayList<ExpressionModel.ExpressionTerm> terms, int i,
			int readRegIndex, int destReg, ArrayList<Instruction> instructions) {
		var regIdx = readRegIndex;
		var instr = instructions;
		var idx = i;
		while (isMultiplicativeNext(terms, idx)) {
			idx++;
			var multTerm = terms.get(idx);
			if (multTerm.isDivided())
				instr = instr.add(new Instruction(Operation.Div, Variant.Immediate, destReg, (long) regIdx));
			else
				instr = instr.add(new Instruction(Operation.Mul, Variant.Immediate, destReg, (long) regIdx));
			regIdx++;
		}
		return regIdx;
	}

	private static int findLastMultiplicativeTermIndex(ArrayList<ExpressionModel.ExpressionTerm> terms, int i) {
		var idx = i;
		while (isMultiplicativeNext(terms, idx)) {
			idx++;
		}
		return idx;
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

	private record AdditiveGroupState(boolean firstAdditiveGroup, int resultReg, ArrayList<Instruction> instructions) {
	}

	private static int processAdditiveGroup(ArrayList<Integer> groupRegs, ArrayList<Character> groupOps,
			boolean isSubtracted, AdditiveGroupState state) {
		var firstAdditiveGroup = state.firstAdditiveGroup();
		var resultReg = state.resultReg();
		var instr = state.instructions();
		if (groupRegs.size() == 1) {
			// Single read in this group
			if (firstAdditiveGroup) {
				return groupRegs.get(0);
			} else {
				// Add or subtract to result
				Operation op;
				if (isSubtracted)
					op = Operation.Sub;
				else
					op = Operation.Add;
				instr = instr.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupRegs.get(0)));
				return resultReg;
			}
		} else {
			// Multiple reads: perform multiplications, divisions, and bitwise operations
			int groupResultReg = groupRegs.get(0);
			for (int j = 1; j < groupRegs.size(); j++) {
				var op = switch (groupOps.get(j)) {
					case '/' -> Operation.Div;
					case '&' -> Operation.BitsAnd;
					case '|' -> Operation.BitsOr;
					case '^' -> Operation.BitsXor;
					case '<' -> Operation.BitsShiftLeft;
					case '>' -> Operation.BitsShiftRight;
					default -> Operation.Mul;
				};
				instr = instr
						.add(new Instruction(op, Variant.Immediate, groupResultReg, (long) groupRegs.get(j)));
			}

			// Add/subtract this group's result to overall result
			if (firstAdditiveGroup) {
				return groupResultReg;
			} else {
				Operation op;
				if (isSubtracted)
					op = Operation.Sub;
				else
					op = Operation.Add;
				instr = instr.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupResultReg));
				return resultReg;
			}
		}
	}

	public static ArrayList<Instruction> addLiteralToResult(int resultReg, long literalValue, int termCount,
			ArrayList<Instruction> instructions) {
		// Count how many reads we have to determine next register
		var literalReg = 0;
		for (var inst : instructions) {
			if (inst.operation() == Operation.In) {
				literalReg++;
			}
		}
		// VM has only 4 registers; also avoid clobbering resultReg.
		literalReg = literalReg & 3;
		if (literalReg == resultReg) {
			for (var candidate = 0; candidate < 4; candidate++) {
				if (candidate != resultReg) {
					literalReg = candidate;
					break;
				}
			}
		}
		return instructions.add(new Instruction(Operation.Load, Variant.Immediate, literalReg, literalValue))
				.add(new Instruction(Operation.Add, Variant.Immediate, resultReg, (long) literalReg));
	}
}
