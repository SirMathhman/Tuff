package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.lib.ArrayList;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class CompoundAssignmentHandler {
	private CompoundAssignmentHandler() {
	}

	/**
	 * Process a compound assignment like x += expr.
	 * 
	 * @param valueExpr    the right-hand side expression
	 * @param operator     the compound operator (+, -, *, /)
	 * @param nextMemAddr  the memory address of the variable
	 * @param instructions the instruction list to add to
	 * @return Result.ok if successful, Result.err otherwise
	 */
	public static Result<Void, CompileError> handle(
			String valueExpr,
			String operator,
			int nextMemAddr,
			ArrayList<Instruction> instructions) {
		// 1. Load current value of x from memory into register 0
		var instr = instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) nextMemAddr));
		// 2. Parse and evaluate the expression
		var genResult = MutableAssignmentHandler.parseAndEvaluateExpression(valueExpr, instr);
		if (genResult instanceof Result.Err<Void, CompileError>)
			return genResult;

		// The expression result is in register 0, store it temporarily
		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 999L));
		// Reload x into register 0
		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) nextMemAddr));
		// Load expr result into register 1
		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, 999L));

		// Apply the compound operator
		if ("+".equals(operator)) {
			instr = instr.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
		} else if ("-".equals(operator)) {
			instr = instr.add(new Instruction(Operation.Sub, Variant.Immediate, 0, 1L));
		} else if ("*".equals(operator)) {
			instr = instr.add(new Instruction(Operation.Mul, Variant.Immediate, 0, 1L));
		} else if ("/".equals(operator)) {
			instr = instr.add(new Instruction(Operation.Div, Variant.Immediate, 0, 1L));
		}
		// Store result back to memory
		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) nextMemAddr));
		return Result.ok(null);
	}
}
