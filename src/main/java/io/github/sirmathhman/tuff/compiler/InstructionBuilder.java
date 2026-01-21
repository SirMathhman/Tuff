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

	public static void loadAllReads(ArrayList<ExpressionModel.ExpressionTerm> terms, ArrayList<Instruction> instructions) {
		var nextReg = 0;
		for (var term : terms) {
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

	private static int buildConditionalExpression(ArrayList<ExpressionModel.ExpressionTerm> terms,
																								ConditionalMarkers markers, ArrayList<Instruction> instructions) {
		// Check if this has nested conditionals (multiple -3 markers)
		var nestedConditionalCount = 0;
		for (var t : terms) {
			if (t.readCount == -3)
				nestedConditionalCount++;
		}

		if (nestedConditionalCount > 1) {
			return buildConditionalExpression(terms, markers, instructions);
		}

		var condTerms = terms.subList(0, markers.branchIdx);
		// If the condition is a literal-only value (e.g., true/false), load it
		// directly.
		if (!(condTerms.size() == 1 && condTerms.get(0).readCount == 0
				&& !condTerms.get(0).isMultiplied() && !condTerms.get(0).isDivided())) {
			buildResultWithPrecedence(condTerms, instructions);
		} else {
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, condTerms.get(0).value));
		}

		final var formulaReg = 1;
		final var trueValueReg = 2;
		final var falseValueReg = 3;

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, trueValueReg, markers.trueLiteral));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, falseValueReg, markers.falseLiteral));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, formulaReg, -1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, formulaReg, 0L));

		var elseJumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) trueValueReg));

		var trueJumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		var elseBodyIdx = instructions.size();
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) falseValueReg));

		var endIdx = instructions.size();
		instructions.set(elseJumpIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, (long) formulaReg, (long) elseBodyIdx));
		instructions.set(trueJumpIdx, new Instruction(Operation.Jump, Variant.Immediate, 0, (long) endIdx));

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
			ArrayList<Instruction> instructions) {
		// For compound comparisons: (a op b) OR (a == b)
		var tempReg = rightResult + 1;
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, leftResult, 0L));
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, tempReg, 0L));
		instructions.add(new Instruction(comparisonOp, Variant.Immediate, tempReg, (long) rightResult));
		instructions.add(new Instruction(Operation.Equal, Variant.Immediate, leftResult, (long) rightResult));
		instructions.add(new Instruction(Operation.LogicalOr, Variant.Immediate, leftResult, (long) tempReg));
	}

	private static int buildTypeCheckExpression(ArrayList<ExpressionModel.ExpressionTerm> terms, int markerIdx,
																							ArrayList<Instruction> instructions) {
		var valueTerms = terms.subList(0, markerIdx);

		int valueResult;
		if (valueTerms.isEmpty())
			valueResult = -1;
		else
			valueResult = buildSubExpressionResult(valueTerms, 0, instructions);

		if (valueResult != -1) {
			// For now, always return 1 (true) as type check result
			// In a full implementation, we'd use the marker's readTypeSpec to check at
			// runtime
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, valueResult, 1L));
			return valueResult;
		}
		return -1;
	}

	private static int buildSubExpressionResult(ArrayList<ExpressionModel.ExpressionTerm> terms, int startReg,
																							ArrayList<Instruction> instructions) {
		var ctx = new BuildContext(terms, instructions);
		var readRegIndex = startReg;
		var resultReg = startReg;
		var firstAdditiveGroup = true;

		var i = 0;
		while (i < terms.size()) {
			var term = terms.get(i);
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
			var groupResult = processMultiplicativeGroup(ctx, i, readRegIndex, firstAdditiveGroup,
					resultReg);
			resultReg = groupResult.resultReg;
			readRegIndex = groupResult.readRegIndex;
			i = groupResult.nextIndex;
			firstAdditiveGroup = false;

			// Check for logical AND boundary (higher precedence than OR)
			if (groupResult.hasLogicalAndBoundary) {
				var andResult = processLogicalAndBoundary(ctx, i, readRegIndex, resultReg);
				resultReg = andResult.resultReg;
				readRegIndex = andResult.readRegIndex;
				i = andResult.nextIndex;
			}

			// Check for logical OR boundary
			if (groupResult.hasLogicalOrBoundary) {
				var orResult = processLogicalOrBoundary(ctx, i, readRegIndex, resultReg);
				resultReg = orResult.resultReg;
				readRegIndex = orResult.readRegIndex;
				i = orResult.nextIndex;
			}

			i++;
		}

		return resultReg;
	}

	private static ProcessGroupResult processMultiplicativeGroup(BuildContext ctx, int i,
			int readRegIndex, boolean firstAdditiveGroup, int resultReg) {
		var terms = ctx.terms();
		var instructions = ctx.instructions();
		var term = terms.get(i);

		// Collect this multiplicative/divisive/bitwise group
		ArrayList<Integer> groupRegs = new ArrayList<>();
		ArrayList<Character> groupOps = new ArrayList<>();
		groupRegs.add(readRegIndex);
		groupOps.add('\0'); // No operator for first term
		var isSubtracted = term.isSubtracted();
		readRegIndex++;

		// Consume all multiplied/divided/bitwise-anded terms that follow
		while (isMultiplicativeNext(terms, i) && !terms.get(i).isParenthesizedGroupEnd()) {
			i++;
			var nextTerm = terms.get(i);
			groupRegs.add(readRegIndex);
			// Use the actual operator char stored in the term
			var op = nextTerm.multiplicativeOperator;
			if (op == '\0') {
				// No operator stored - infer from flags (backward compatibility)
				if (nextTerm.isDivided())
					op = '/';
				else
					op = '*';
			}
			groupOps.add(op);
			readRegIndex++;
		}

		// Generate instructions for this group
		resultReg = processAdditiveGroup(groupRegs, groupOps, isSubtracted,
				new AdditiveGroupState(firstAdditiveGroup, resultReg, instructions));

		var hasLogicalOrBoundary = term.isLogicalOrBoundary();
		var hasLogicalAndBoundary = term.isLogicalAndBoundary();
		return new ProcessGroupResult(resultReg, readRegIndex, i, hasLogicalOrBoundary, hasLogicalAndBoundary);
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
		var terms = ctx.terms();
		var instructions = ctx.instructions();
		do {
			i++;
		} while (i < terms.size() && terms.get(i).readCount == 0);

		if (i < terms.size()) {
			var nextGroupReg = readRegIndex;
			readRegIndex++;

			// Consume multiplicative/divisive terms and generate instructions
			readRegIndex = consumeAndEmitMultiplicativeTerms(terms, i, readRegIndex, nextGroupReg, instructions);
			i = findLastMultiplicativeTermIndex(terms, i);

			// Perform logical operation (OR or AND)
			instructions.add(new Instruction(logicalOp, Variant.Immediate, resultReg, (long) nextGroupReg));
		}

		return new ProcessOrResult(resultReg, readRegIndex, i);
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
		while (isMultiplicativeNext(terms, i)) {
			i++;
			var multTerm = terms.get(i);
			if (multTerm.isDivided())
				instructions.add(new Instruction(Operation.Div, Variant.Immediate, destReg, (long) readRegIndex));
			else
				instructions.add(new Instruction(Operation.Mul, Variant.Immediate, destReg, (long) readRegIndex));
			readRegIndex++;
		}
		return readRegIndex;
	}

	private static int findLastMultiplicativeTermIndex(ArrayList<ExpressionModel.ExpressionTerm> terms, int i) {
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

	private record AdditiveGroupState(boolean firstAdditiveGroup, int resultReg, ArrayList<Instruction> instructions) {
	}

	private static int processAdditiveGroup(ArrayList<Integer> groupRegs, ArrayList<Character> groupOps,
			boolean isSubtracted, AdditiveGroupState state) {
		var firstAdditiveGroup = state.firstAdditiveGroup();
		var resultReg = state.resultReg();
		var instructions = state.instructions();
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
				instructions.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupRegs.get(0)));
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
				instructions.add(new Instruction(op, Variant.Immediate, groupResultReg, (long) groupRegs.get(j)));
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
				instructions.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupResultReg));
				return resultReg;
			}
		}
	}

	public static void addLiteralToResult(int resultReg, long literalValue, int termCount,
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
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, literalReg, literalValue));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, resultReg, (long) literalReg));
	}
}
