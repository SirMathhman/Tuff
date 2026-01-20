package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.App;
import java.util.List;
import java.util.Map;

public final class WhileLoopHandler {
	private WhileLoopHandler() {
	}

	public static boolean hasWhileLoop(String stmt) {
		return stmt.startsWith("while (");
	}

	public static Result<Void, CompileError> handleWhileLoop(String stmt, String continuation,
			List<Instruction> instructions, Map<String, Integer> variableAddresses) {
		int conditionEnd = findConditionEnd(stmt);
		if (conditionEnd == -1) {
			return Result.err(new CompileError("Malformed while loop: missing closing paren for condition"));
		}

		String condition = stmt.substring(7, conditionEnd);
		String remaining = stmt.substring(conditionEnd + 1).trim();
		LoopParts loopParts = parseLoopParts(remaining, continuation);

		int loopStartIdx = instructions.size();

		Result<Void, CompileError> condResult = evaluateLoopCondition(condition, variableAddresses, instructions);
		if (condResult.isErr()) {
			return condResult;
		}

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, -1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 2, 0L));

		int exitJumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		if (!loopParts.body.contains("=")) {
			return Result.err(new CompileError("While loop body must contain assignment"));
		}

		Result<Void, CompileError> bodyResult = parseLoopBody(loopParts.body, instructions, variableAddresses);
		if (bodyResult.isErr()) {
			return bodyResult;
		}

		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, (long) loopStartIdx));
		int exitIdx = instructions.size();
		instructions.set(exitJumpIdx, new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 2L, (long) exitIdx));

		return handleAfterLoop(loopParts.afterLoop, variableAddresses, instructions);
	}

	private static class LoopParts {
		String body;
		String afterLoop;

		LoopParts(String body, String afterLoop) {
			this.body = body;
			this.afterLoop = afterLoop;
		}
	}

	private static LoopParts parseLoopParts(String remaining, String continuation) {
		if (remaining.startsWith("{")) {
			int closeIdx = DepthAwareSplitter.findMatchingBrace(remaining, 0);
			if (closeIdx != -1) {
				String body = remaining.substring(1, closeIdx).trim();
				String afterLoop = remaining.substring(closeIdx + 1).trim();
				return new LoopParts(body, afterLoop);
			}
		}

		int semiIdx = findSemicolonAtDepth(remaining);
		if (semiIdx == -1) {
			return new LoopParts(remaining, continuation);
		}

		String body = remaining.substring(0, semiIdx).trim();
		String afterLoop = remaining.substring(semiIdx + 1).trim();
		return new LoopParts(body, afterLoop);
	}

	private static Result<Void, CompileError> handleAfterLoop(String afterLoop, Map<String, Integer> variableAddresses,
			List<Instruction> instructions) {
		if (afterLoop.isEmpty()) {
			return Result.ok(null);
		}

		if (variableAddresses.containsKey(afterLoop)) {
			instructions
					.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) variableAddresses.get(afterLoop)));
			instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		return App.parseStatement(afterLoop, instructions);
	}

	private static Result<Void, CompileError> parseLoopBody(String body, List<Instruction> instructions,
			Map<String, Integer> variableAddresses) {
		String[] parts = body.split("=", 2);
		if (parts.length != 2) {
			return Result.err(new CompileError("Invalid loop body: expected assignment"));
		}

		String lhs = parts[0].trim();
		String rhs = parts[1].trim();
		String operator = extractCompoundOp(lhs);

		if (operator != null) {
			return handleCompoundOp(lhs.substring(0, lhs.length() - 1).trim(), rhs, operator, instructions,
					variableAddresses);
		}

		Integer varAddr = variableAddresses.get(lhs);
		if (varAddr == null) {
			return Result.err(new CompileError("Undefined variable: " + lhs));
		}

		if (rhs.startsWith(lhs)) {
			return handleSelfReferentialAssignment(lhs, varAddr, rhs.substring(lhs.length()).trim(), instructions);
		}

		return parseAndGenerateExpression(rhs, instructions, varAddr);
	}

	private static Result<Void, CompileError> parseAndGenerateExpression(String expr, List<Instruction> instructions,
			Integer storeAddr) {
		Result<ExpressionModel.ExpressionResult, CompileError> rhsResult = App.parseExpressionWithRead(expr);
		if (rhsResult.isErr()) {
			return Result.err(rhsResult.errValue());
		}

		Result<Void, CompileError> genResult = App.generateInstructions(rhsResult.okValue(), instructions);
		if (genResult.isErr()) {
			return genResult;
		}

		if (storeAddr != null) {
			instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) storeAddr));
		}
		return Result.ok(null);
	}

	private static String extractCompoundOp(String lhs) {
		if (lhs.endsWith("+"))
			return "+=";
		if (lhs.endsWith("-"))
			return "-=";
		if (lhs.endsWith("*"))
			return "*=";
		if (lhs.endsWith("/"))
			return "/=";
		return null;
	}

	private static Result<Void, CompileError> handleCompoundOp(String varName, String rhs, String operator,
			List<Instruction> instructions, Map<String, Integer> variableAddresses) {
		Integer varAddr = variableAddresses.get(varName);
		if (varAddr == null) {
			return Result.err(new CompileError("Undefined variable: " + varName));
		}

		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));

		Result<Void, CompileError> parseResult = parseAndGenerateExpression(rhs, instructions, null);
		if (parseResult.isErr()) {
			return parseResult;
		}

		Operation op = switch (operator) {
			case "+=" -> Operation.Add;
			case "-=" -> Operation.Sub;
			case "*=" -> Operation.Mul;
			case "/=" -> Operation.Div;
			default -> throw new IllegalArgumentException("Unknown operator: " + operator);
		};

		instructions.add(new Instruction(op, Variant.Immediate, 0, 0L));
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) varAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> handleSelfReferentialAssignment(String varName, int varAddr,
			String rhsAfterVar, List<Instruction> instructions) {
		if (rhsAfterVar.isEmpty()) {
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));
			instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) varAddr));
			return Result.ok(null);
		}

		if (rhsAfterVar.length() == 0 || "-+*/".indexOf(rhsAfterVar.substring(0, 1)) == -1) {
			return Result.err(new CompileError("Invalid operator in assignment: " + rhsAfterVar));
		}

		char opChar = rhsAfterVar.charAt(0);
		String expr = rhsAfterVar.substring(1).trim();

		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));

		try {
			long literalValue = Long.parseLong(expr);
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, literalValue));
			Operation op = getOperationFromChar(opChar);
			instructions.add(new Instruction(op, Variant.Immediate, 0, 1L));
		} catch (NumberFormatException e) {
			Result<Void, CompileError> complexResult = handleComplexRhsExpression(opChar, expr, instructions);
			if (complexResult.isErr()) {
				return complexResult;
			}
		}

		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) varAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> handleComplexRhsExpression(char opChar, String expr,
			List<Instruction> instructions) {
		Result<ExpressionModel.ExpressionResult, CompileError> exprResult = App.parseExpressionWithRead(expr);
		if (exprResult.isErr()) {
			return Result.err(exprResult.errValue());
		}

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 1, 0L));

		Result<Void, CompileError> genResult = App.generateInstructions(exprResult.okValue(), instructions);
		if (genResult.isErr()) {
			return genResult;
		}

		if (opChar == '-') {
			instructions.add(new Instruction(Operation.Sub, Variant.Immediate, 1, 0L));
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L));
			instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
		} else {
			Operation op = getOperationFromChar(opChar);
			instructions.add(new Instruction(op, Variant.Immediate, 0, 1L));
		}

		return Result.ok(null);
	}

	private static Operation getOperationFromChar(char opChar) {
		return switch (opChar) {
			case '+' -> Operation.Add;
			case '-' -> Operation.Sub;
			case '*' -> Operation.Mul;
			case '/' -> Operation.Div;
			default -> throw new IllegalArgumentException();
		};
	}

	private static int findConditionEnd(String expr) {
		int parenDepth = 1;
		for (int i = 7; i < expr.length(); i++) {
			if (expr.charAt(i) == '(')
				parenDepth++;
			else if (expr.charAt(i) == ')')
				parenDepth--;
			if (parenDepth == 0)
				return i;
		}
		return -1;
	}

	private static int findSemicolonAtDepth(String str) {
		int depth = 0;
		for (int i = 0; i < str.length(); i++) {
			char c = str.charAt(i);
			if (c == '(' || c == '{')
				depth++;
			else if (c == ')' || c == '}')
				depth--;
			else if (c == ';' && depth == 0)
				return i;
		}
		return -1;
	}

	private static Result<Void, CompileError> evaluateLoopCondition(String condition,
			Map<String, Integer> variableAddresses, List<Instruction> instructions) {
		String[] parts = findComparisonParts(condition);
		String operator = findComparisonOperator(condition);

		if (parts == null || parts.length != 2) {
			return Result.err(new CompileError("Invalid condition: " + condition));
		}

		String lhs = parts[0].trim();
		String rhs = parts[1].trim();

		Integer lhsAddr = variableAddresses.get(lhs);
		if (lhsAddr == null) {
			return Result.err(new CompileError("Undefined variable in condition: " + lhs));
		}

		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) lhsAddr));

		Integer rhsAddr = variableAddresses.get(rhs);
		if (rhsAddr != null) {
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) rhsAddr));
		} else {
			try {
				long rhsValue = Long.parseLong(rhs);
				instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, rhsValue));
			} catch (NumberFormatException e) {
				return Result.err(new CompileError("Invalid RHS in condition: " + rhs));
			}
		}

		return applyComparisonOp(operator, instructions);
	}

	private static String[] findComparisonParts(String condition) {
		if (condition.contains("=="))
			return condition.split("==", 2);
		if (condition.contains("!="))
			return condition.split("!=", 2);
		if (condition.contains("<="))
			return condition.split("<=", 2);
		if (condition.contains(">="))
			return condition.split(">=", 2);
		if (condition.contains("<"))
			return condition.split("<", 2);
		if (condition.contains(">"))
			return condition.split(">", 2);
		return null;
	}

	private static String findComparisonOperator(String condition) {
		if (condition.contains("=="))
			return "==";
		if (condition.contains("!="))
			return "!=";
		if (condition.contains("<="))
			return "<=";
		if (condition.contains(">="))
			return ">=";
		if (condition.contains("<"))
			return "<";
		if (condition.contains(">"))
			return ">";
		return null;
	}

	private static Result<Void, CompileError> applyComparisonOp(String operator, List<Instruction> instructions) {
		switch (operator) {
			case "==" -> instructions.add(new Instruction(Operation.Equal, Variant.Immediate, 0, 1L));
			case "!=" -> {
				instructions.add(new Instruction(Operation.Equal, Variant.Immediate, 0, 1L));
				instructions.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 0, 0L));
			}
			case "<" -> instructions.add(new Instruction(Operation.LessThan, Variant.Immediate, 0, 1L));
			case ">" -> instructions.add(new Instruction(Operation.GreaterThan, Variant.Immediate, 0, 1L));
			case "<=" -> {
				instructions.add(new Instruction(Operation.GreaterThan, Variant.Immediate, 0, 1L));
				instructions.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 0, 0L));
			}
			case ">=" -> {
				instructions.add(new Instruction(Operation.LessThan, Variant.Immediate, 0, 1L));
				instructions.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 0, 0L));
			}
		}
		return Result.ok(null);
	}
}
