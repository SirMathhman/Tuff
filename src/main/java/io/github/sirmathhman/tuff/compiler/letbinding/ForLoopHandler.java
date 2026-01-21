package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class ForLoopHandler {
	private ForLoopHandler() {
	}

	public static Result<Void, CompileError> handleForLoop(String stmt, ArrayList<Instruction> instructions,
			Map<String, Integer> externalVariables) {
		var s = stmt.trim();
		var instr = instructions;
		var conditionEnd = CompilerHelpers.findConditionEnd(s, 5);
		if (conditionEnd == -1) {
			return Result
					.err(new CompileError("Malformed for loop: missing closing paren for condition. Statement: " + s));
		}

		var condition = s.substring(5, conditionEnd);
		var remaining = s.substring(conditionEnd + 1).trim();

		var parseResult = parseForLoopCondition(condition);
		if (parseResult instanceof Result.Err<ForLoopCondition, CompileError> parseErr) {
			return Result.err(parseErr.error());
		}
		var loopCond = ((Result.Ok<ForLoopCondition, CompileError>) parseResult).value();

		if (remaining.isEmpty()) {
			return Result.err(new CompileError("For loop requires body"));
		}

		var setupResult = setupLoopVariables(loopCond.startExpr(), loopCond.endExpr(),
				instr, externalVariables, loopCond.iterVarName());
		if (setupResult instanceof Result.Err<Integer, CompileError> setupErr) {
			return Result.err(setupErr.error());
		}
		var iterVarAddr = ((Result.Ok<Integer, CompileError>) setupResult).value();
		var loopConditionIdx = instr.size();

		// Load and compare loop condition
		instr = addLoopConditionComparison(instr, iterVarAddr);

		// Placeholder for exit jump
		var exitJumpIdx = instr.size();
		instr = instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		// Parse body
		var bodyResult = parseForLoopBody(remaining, iterVarAddr, loopCond.iterVarName(),
				instr, externalVariables);
		if (bodyResult instanceof Result.Err<Void, CompileError>) {
			return bodyResult;
		}

		// Increment iterator and jump back
		instr = addLoopIncrement(instr, iterVarAddr, loopConditionIdx);

		// Set exit jump
		var exitIdx = instr.size();
		instr = instr.set(exitJumpIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 2L, (long) exitIdx));

		// Handle after-loop continuation
		return handleLoopContinuation(remaining, instr);
	}

	private static ArrayList<Instruction> addLoopConditionComparison(ArrayList<Instruction> instructions,
			Integer iterVarAddr) {
		return instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) iterVarAddr))
				.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, 201L))
				.add(new Instruction(Operation.LessThan, Variant.Immediate, 0, 1L))
				.add(new Instruction(Operation.Load, Variant.Immediate, 2, -1L))
				.add(new Instruction(Operation.Add, Variant.Immediate, 2, 0L));
	}

	private static ArrayList<Instruction> addLoopIncrement(ArrayList<Instruction> instructions, Integer iterVarAddr,
			int loopConditionIdx) {
		return instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) iterVarAddr))
				.add(new Instruction(Operation.Load, Variant.Immediate, 1, 1L))
				.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L))
				.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) iterVarAddr))
				.add(new Instruction(Operation.Jump, Variant.Immediate, 0, (long) loopConditionIdx));
	}

	private static Result<Void, CompileError> handleLoopContinuation(String remaining,
			ArrayList<Instruction> instructions) {
		var bodyEndSemiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(remaining, 0);
		if (bodyEndSemiIdx != -1 && bodyEndSemiIdx + 1 < remaining.length()) {
			var afterLoop = remaining.substring(bodyEndSemiIdx + 1).trim();
			if (!afterLoop.isEmpty()) {
				return App.parseStatement(afterLoop, instructions);
			}
		}
		return Result.ok(null);
	}

	@SuppressWarnings("CheckReturnValue")
	private static Result<Integer, CompileError> setupLoopVariables(
			String startExpr,
			String endExpr,
			ArrayList<Instruction> instructions,
			Map<String, Integer> externalVariables,
			String iterVarName) {
		var iterVarAddr = externalVariables.getOrDefault(iterVarName, 200);
		var instr = instructions;

		// Parse and evaluate start value
		if (externalVariables.containsKey(startExpr)) {
			var startVarAddr = externalVariables.get(startExpr);
			instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) startVarAddr));
		} else {
			var startResult = App.parseExpressionWithRead(startExpr);
			if (startResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> startErr) {
				return Result.err(startErr.error());
			}
			var startOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) startResult)
					.value();
			var genStart = App.generateInstructions(startOk, instr);
			if (genStart instanceof Result.Err<ArrayList<Instruction>, CompileError> genStartErr) {
				return Result.err(genStartErr.error());
			}
		}

		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) iterVarAddr));

		// Parse and evaluate end value
		if (externalVariables.containsKey(endExpr)) {
			var endVarAddr = externalVariables.get(endExpr);
			instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) endVarAddr));
		} else {
			var endResult = App.parseExpressionWithRead(endExpr);
			if (endResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> endErr) {
				return Result.err(endErr.error());
			}
			var endOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) endResult)
					.value();
			var genEnd = App.generateInstructions(endOk, instr);
			if (genEnd instanceof Result.Err<ArrayList<Instruction>, CompileError> genEndErr) {
				return Result.err(genEndErr.error());
			}
		}

		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 201L));
		return Result.ok(iterVarAddr);
	}

	private static Result<ForLoopCondition, CompileError> parseForLoopCondition(String condition) {
		if (!condition.startsWith("let mut ")) {
			return Result.err(new CompileError("For loop requires 'let mut' iterator variable. Got: " + condition));
		}

		var afterLet = condition.substring(8);
		var inIndex = afterLet.indexOf(" in ");
		if (inIndex == -1) {
			return Result.err(new CompileError("For loop requires 'in' keyword"));
		}

		var iterVarName = afterLet.substring(0, inIndex).trim();
		var rangeExpr = afterLet.substring(inIndex + 4).trim();

		var dotDotIndex = findRangeSeparator(rangeExpr);
		if (dotDotIndex == -1) {
			return Result.err(new CompileError("For loop range must use '..' syntax"));
		}

		var startExpr = rangeExpr.substring(0, dotDotIndex).trim();
		var endExpr = rangeExpr.substring(dotDotIndex + 2).trim();

		return Result.ok(new ForLoopCondition(iterVarName, startExpr, endExpr));
	}

	private static int findRangeSeparator(String expr) {
		var depth = 0;
		for (var i = 0; i < expr.length() - 1; i++) {
			if (expr.charAt(i) == '(')
				depth++;
			else if (expr.charAt(i) == ')')
				depth--;
			else if (depth == 0 && expr.charAt(i) == '.' && expr.charAt(i + 1) == '.') {
				return i;
			}
		}
		return -1;
	}

	@SuppressWarnings("CheckReturnValue")
	private static Result<Void, CompileError> parseForLoopBody(String body, Integer iterVarAddr, String iterVarName,
			ArrayList<Instruction> instructions, Map<String, Integer> externalVariables) {
		var b = body.trim();

		// Find the end of the body (first semicolon at depth 0)
		var semiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(b, 0);
		if (semiIdx == -1) {
			return Result.err(new CompileError("For loop body must end with semicolon"));
		}

		var bodyStmt = b.substring(0, semiIdx).trim();

		// Parse body as a statement (assignment or expression)
		if (bodyStmt.contains("+=") || bodyStmt.contains("-=") || bodyStmt.contains("*=") || bodyStmt.contains("/=")) {
			// Compound assignment
			return handleCompoundAssignmentInForLoop(bodyStmt, iterVarAddr, iterVarName, instructions, externalVariables);
		}

		// For now, just execute as expression
		var bodyResult = App.parseExpressionWithRead(bodyStmt);
		if (bodyResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> bodyErr) {
			return Result.err(bodyErr.error());
		}
		var bodyOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) bodyResult)
				.value();
		return App.generateInstructions(bodyOk, instructions).map(ignored -> (Void) null);
	}

	@SuppressWarnings("CheckReturnValue")
	private static Result<Void, CompileError> handleCompoundAssignmentInForLoop(String stmt, Integer iterVarAddr,
			String iterVarName, ArrayList<Instruction> instructions, Map<String, Integer> externalVariables) {
		// Format: "var += expr" or similar
		var parts = stmt.split("\\+=|-=|\\*=|/=");
		if (parts.length != 2) {
			return Result.err(new CompileError("Invalid compound assignment"));
		}

		var varName = parts[0].trim();
		var exprStr = parts[1].trim();

		// Get variable address from external variables
		if (!externalVariables.containsKey(varName)) {
			return Result.err(new CompileError("Undefined variable: " + varName));
		}

		var varAddr = externalVariables.get(varName);

		// Determine the operator
		char opChar;
		if (stmt.contains("+="))
			opChar = '+';
		else if (stmt.contains("-="))
			opChar = '-';
		else if (stmt.contains("*="))
			opChar = '*';
		else if (stmt.contains("/="))
			opChar = '/';
		else
			return Result.err(new CompileError("Unknown compound operator"));

		// Load variable value
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));

		// Parse and evaluate right-hand side expression
		// If the RHS is just the loop iterator, load it directly to reg[3]
		if (exprStr.equals(iterVarName)) {
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 3, (long) iterVarAddr));
		} else {
			var genResult = CompilerHelpers.parseAndGenerateExpression(exprStr, instructions);
			if (genResult instanceof Result.Err<Void, CompileError>) {
				return genResult;
			}
		}

		// Apply the operation: registers[0] op= registers[0]
		// Variable is in reg[0], rhs result is in reg[0] or reg[3]
		// We need to do: result = var op rhs

		// Load variable again to reg[1]
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) varAddr));
		// Determine which register has the RHS
		int rhsReg;
		if (exprStr.equals(iterVarName))
			rhsReg = 3;
		else
			rhsReg = 0;
		// RHS result is in rhsReg, now do: reg[1] = reg[1] op reg[rhsReg]
		var op = switch (opChar) {
			case '+' -> Operation.Add;
			case '-' -> Operation.Sub;
			case '*' -> Operation.Mul;
			case '/' -> Operation.Div;
			default -> throw new IllegalArgumentException();
		};

		instructions.add(new Instruction(op, Variant.Immediate, 1, (long) rhsReg))
				.add(new Instruction(Operation.Store, Variant.DirectAddress, 1, (long) varAddr));

		return Result.ok(null);
	}

	record ForLoopCondition(String iterVarName, String startExpr, String endExpr) {
	}
}
