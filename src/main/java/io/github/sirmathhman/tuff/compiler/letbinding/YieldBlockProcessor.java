package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.ExpressionTokens;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.lib.ArrayList;

public final class YieldBlockProcessor {
	private YieldBlockProcessor() {
	}

	public static Result<Void, CompileError> handleYieldBlock(
			String varName,
			String blockContent,
			String continuation,
			ArrayList<Instruction> instructions,
			int storeAddr) {
		var parts = splitSemicolonsAtDepthZero(blockContent);
		var lastIdx = lastNonEmptyIndex(parts);
		if (lastIdx == -1) {
			return Result.err(new CompileError("Yield block is empty"));
		}

		ArrayList<Integer> endJumpPatchPoints = new ArrayList<>();
		for (var i = 0; i <= lastIdx; i++) {
			var part = parts.get(i).trim();
			if (part.isEmpty()) {
				continue;
			}
			var isLast = i == lastIdx;
			var partResult = processYieldBlockPart(part, isLast, instructions, storeAddr,
					endJumpPatchPoints);
			if (partResult instanceof Result.Err<Void, CompileError>) {
				return partResult;
			}
		}

		patchEndJumps(endJumpPatchPoints, instructions);
		var instr = instructions;
		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) storeAddr));

		if (!continuation.isEmpty() && !continuation.equals(varName)) {
			return App.parseStatement(continuation, instr);
		}
		return Result.ok(null);
	}

	private static Result<Void, CompileError> processYieldBlockPart(String part, boolean isLast,
			ArrayList<Instruction> instructions, int storeAddr, ArrayList<Integer> endJumpPatchPoints) {
		var trimmed = part.trim();
		if (trimmed.startsWith("yield")) {
			var yieldResult = emitYieldToStore(trimmed.substring(5).trim(), instructions, storeAddr);
			if (yieldResult instanceof Result.Err<Void, CompileError>) {
				return yieldResult;
			}
			if (!isLast) {
				var placeholder = addJumpPlaceholder(instructions);
				var unused = endJumpPatchPoints.add(placeholder);
			}
			return Result.ok(null);
		}
		if (trimmed.startsWith("if (") && trimmed.contains("yield")) {
			return processConditionalYieldPart(trimmed, isLast, instructions, storeAddr, endJumpPatchPoints);
		}
		if (isLast) {
			return emitYieldToStore(trimmed, instructions, storeAddr);
		}
		return App.parseStatement(trimmed, instructions);
	}

	private static Result<Void, CompileError> processConditionalYieldPart(String part, boolean isLast,
			ArrayList<Instruction> instructions, int storeAddr, ArrayList<Integer> endJumpPatchPoints) {
		var conditionEnd = ConditionalExpressionHandler.findConditionEnd(part);
		if (conditionEnd == -1) {
			return Result.err(new CompileError("Malformed conditional in yield block: missing closing paren"));
		}
		var condition = part.substring(4, conditionEnd).trim();
		var remaining = part.substring(conditionEnd + 1).trim();
		if (!remaining.startsWith("yield")) {
			return Result.err(new CompileError("Expected 'yield' after if condition in yield block"));
		}
		var yieldExpr = remaining.substring(5).trim();

		var condTypeResult = validateBoolCondition(condition);
		if (condTypeResult instanceof Result.Err<Void, CompileError>) {
			return condTypeResult;
		}

		var genCond = generateExpression(condition, instructions);
		if (genCond instanceof Result.Err<Void, CompileError>) {
			return genCond;
		}

		final var formulaReg = 1;
		var instr = instructions;
		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, formulaReg, -1L))
				.add(new Instruction(Operation.Add, Variant.Immediate, formulaReg, 0L));
		var skipYieldJumpIdx = instr.size();
		instr = instr.add(new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, (long) formulaReg, 0L));

		var yieldResult = emitYieldToStore(yieldExpr, instr, storeAddr);
		if (yieldResult instanceof Result.Err<Void, CompileError>) {
			return yieldResult;
		}
		if (!isLast) {
			var placeholder = addJumpPlaceholder(instr);
			var unused = endJumpPatchPoints.add(placeholder);
		}

		var afterYieldAddr = instr.size();
		instr = instr.set(skipYieldJumpIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, (long) formulaReg, (long) afterYieldAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> generateExpression(String expr, ArrayList<Instruction> instructions) {
		var result = App.parseExpressionWithRead(expr);
		if (result instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> err) {
			return Result.err(err.error());
		}
		return App.generateInstructions(((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) result).value(),
				instructions);
	}

	private static void patchEndJumps(ArrayList<Integer> endJumpPatchPoints, ArrayList<Instruction> instructions) {
		var endAddr = instructions.size();
		var instr = instructions;
		for (int jumpIdx : endJumpPatchPoints) {
			instr = instr.set(jumpIdx, new Instruction(Operation.Jump, Variant.Immediate, 0, (long) endAddr));
		}
	}

	private static int addJumpPlaceholder(ArrayList<Instruction> instructions) {
		var idx = instructions.size();
		var instr = instructions;
		instr = instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, 0L));
		return idx;
	}

	private static Result<Void, CompileError> emitYieldToStore(String yieldExpr,
			ArrayList<Instruction> instructions, int storeAddr) {
		var expr = yieldExpr.trim();
		if (expr.endsWith(";")) {
			expr = expr.substring(0, expr.length() - 1).trim();
		}

		var genResult = generateExpression(expr, instructions);
		if (genResult instanceof Result.Err<Void, CompileError>) {
			return genResult;
		}
		var instr = instructions;
		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) storeAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> validateBoolCondition(String condition) {
		var typeResult = ExpressionTokens.extractTypeFromExpression(condition,
				new java.util.HashMap<>());
		return typeResult.match(condType -> {
			if (!condType.equals("Bool")) {
				return Result.err(new CompileError(
						"Conditional expression requires Bool type, but got " + condType));
			}
			return Result.ok(null);
		}, err -> Result.ok(null));
	}

	private static ArrayList<String> splitSemicolonsAtDepthZero(String blockContent) {
		ArrayList<String> parts = new ArrayList<>();
		var depth = 0;
		var start = 0;
		for (var i = 0; i < blockContent.length(); i++) {
			var c = blockContent.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ';' && depth == 0) {
				parts = parts.add(blockContent.substring(start, i).trim());
				start = i + 1;
			}
		}
		if (start <= blockContent.length()) {
			parts = parts.add(blockContent.substring(start).trim());
		}
		return parts;
	}

	private static int lastNonEmptyIndex(ArrayList<String> parts) {
		for (var i = parts.size() - 1; i >= 0; i--) {
			if (!parts.get(i).trim().isEmpty()) {
				return i;
			}
		}
		return -1;
	}
}
