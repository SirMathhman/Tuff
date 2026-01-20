package io.github.sirmathhman.tuff.compiler;

import java.util.List;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

/**
 * Handler for mutable variable assignments (x = value, x += value, etc).
 */
public final class MutableAssignmentHandler {
	private MutableAssignmentHandler() {
	}

	public static Result<Void, CompileError> handleAssignment(
			String varName,
			String continuation,
			List<Instruction> instructions,
			int nextMemAddr,
			boolean isUninitialized,
			boolean isMutableUninitialized) {
		String remaining = continuation;
		int assignmentCount = 0;
		while (true) {
			Result<AssignmentParseResult, CompileError> assignResult = parseAssignment(varName, remaining);
			if (assignResult.isErr())
				break; // No more assignments

			AssignmentParseResult parsed = assignResult.okValue();
			Result<Void, CompileError> validationResult = validateUninitializedAssignment(isUninitialized,
					varName, assignmentCount, isMutableUninitialized);
			if (validationResult.isErr())
				return validationResult;
			assignmentCount++;

			if (parsed.isDereference()) {
				Result<ExpressionModel.ExpressionResult, CompileError> exprResult = App.parseExpressionWithRead(parsed.valueExpr());
				if (exprResult.isErr())
					return Result.err(exprResult.errValue());
				Result<Void, CompileError> genResult = App.generateInstructions(exprResult.okValue(), instructions);
				if (genResult.isErr())
					return genResult;
				instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) nextMemAddr));
				instructions.add(new Instruction(Operation.Store, Variant.IndirectAddress, 0, 1L));
			} else {
				Result<Void, CompileError> processResult;
				if (parsed.compoundOp() != null) {
					processResult = CompoundAssignmentHandler.handle(
							parsed.valueExpr(), parsed.compoundOp(), nextMemAddr, instructions);
				} else {
					processResult = processAssignmentValue(parsed.valueExpr(), instructions, nextMemAddr);
				}
				if (processResult.isErr())
					return processResult;
			}
			remaining = parsed.remaining();
		}
		return Result.ok(null);
	}

	private static Result<Void, CompileError> validateUninitializedAssignment(
			boolean isUninitialized,
			String varName,
			int assignmentCount,
			boolean isMutableUninitialized) {
		if (isUninitialized && assignmentCount > 0 && !isMutableUninitialized) {
			return Result.err(new CompileError(
					"Uninitialized variable '" + varName + "' can only be assigned once"));
		}
		return Result.ok(null);
	}

	private static Result<Void, CompileError> processAssignmentValue(
			String valueExpr,
			List<Instruction> instructions,
			int nextMemAddr) {
		Result<ExpressionModel.ExpressionResult, CompileError> exprResult = App.parseExpressionWithRead(valueExpr);
		if (exprResult.isErr())
			return Result.err(exprResult.errValue());
		Result<Void, CompileError> assignGenResult = App.generateInstructions(exprResult.okValue(), instructions);
		if (assignGenResult.isErr())
			return assignGenResult;
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) nextMemAddr));
		return Result.ok(null);
	}

	private static Result<AssignmentParseResult, CompileError> parseAssignment(String varName, String remaining) {
		String trimmed = remaining.trim();
		boolean isDereference = trimmed.startsWith("*");
		String assignTarget = isDereference ? ("*" + varName) : varName;

		if (!trimmed.startsWith(assignTarget + " ") && !trimmed.startsWith(assignTarget + "=")) {
			return Result.err(new CompileError("Not an assignment"));
		}

		int assignEqIndex = remaining.indexOf('=');
		if (assignEqIndex == -1) {
			return Result.err(new CompileError("Not an assignment"));
		}

		String beforeEq = remaining.substring(0, assignEqIndex).trim();

		// Check if it's a simple assignment (beforeEq equals assignTarget)
		// or a compound assignment (beforeEq equals assignTarget + operator)
		String compoundOp = null;
		if (beforeEq.equals(assignTarget)) {
			// Simple assignment: x = expr
		} else if (beforeEq.length() > assignTarget.length()) {
			// Check for compound operator
			String potential = beforeEq.substring(assignTarget.length()).trim();
			if (potential.length() == 1 && (potential.equals("+") || potential.equals("-")
					|| potential.equals("*") || potential.equals("/"))) {
				compoundOp = potential;
			} else {
				return Result.err(new CompileError("Not an assignment"));
			}
		} else {
			return Result.err(new CompileError("Not an assignment"));
		}

		int assignSemiIndex = ParsingUtils.findSemicolonAtDepthZero(remaining, assignEqIndex);
		if (assignSemiIndex == -1) {
			return Result.err(new CompileError("Invalid assignment: missing ';'"));
		}

		String assignValueExpr = remaining.substring(assignEqIndex + 1, assignSemiIndex).trim();
		String nextRemaining = remaining.substring(assignSemiIndex + 1).trim();

		return Result.ok(new AssignmentParseResult(assignValueExpr, nextRemaining, isDereference, compoundOp));
	}

	private record AssignmentParseResult(String valueExpr, String remaining, boolean isDereference,
			String compoundOp) {
	}
}
