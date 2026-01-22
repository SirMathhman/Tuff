package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.lib.ArrayList;

public final class ConditionalExpressionHandler {
	private ConditionalExpressionHandler() {
	}

	public static boolean hasConditional(String expr) {
		return expr.startsWith("if (");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseConditional(String expr) {
		// Format: if (condition) trueValue else falseValue
		var conditionEnd = findConditionEnd(expr);
		if (conditionEnd == -1) {
			return Result.err(new CompileError("Malformed conditional: missing closing paren for condition"));
		}

		var condition = expr.substring(4, conditionEnd);
		var remaining = expr.substring(conditionEnd + 1).trim();

		var elseIndex = findElseKeyword(remaining);
		if (elseIndex == -1) {
			return Result.err(new CompileError("Malformed conditional: missing 'else' clause"));
		}

		return parseConditionAndBranches(condition, remaining, elseIndex);
	}

	public static int findConditionEnd(String expr) {
		var parenDepth = 1;
		for (var i = 4; i < expr.length(); i++) {
			var c = expr.charAt(i);
			if (c == '(')
				parenDepth++;
			else if (c == ')')
				parenDepth--;
			if (parenDepth == 0)
				return i;
		}
		return -1;
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseConditionAndBranches(
			String condition, String remaining, int elseIndex) {
		var trueExpr = remaining.substring(0, elseIndex).trim();
		var falseExpr = remaining.substring(elseIndex + 4).trim();

		var condResult = parseExpressionForConditional(condition);
		if (condResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>)
			return condResult;

		// Validate that the condition is a Bool type
		var condTypeResult = ExpressionTokens.extractTypeFromExpression(condition,
				new java.util.HashMap<>());
		Result<Void, CompileError> typeValidation = condTypeResult.match(condType -> {
			if (!condType.equals("Bool")) {
				return Result.err(new CompileError("Conditional expression requires Bool type, but got " + condType));
			}
			return Result.ok(null);
		}, err -> Result.ok(null));
		if (typeValidation instanceof Result.Err<Void, CompileError> typeErr) {
			return Result.err(typeErr.error());
		}

		var trueResult = parseExpressionForConditional(trueExpr);
		if (trueResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>)
			return trueResult;

		var falseResult = parseExpressionForConditional(falseExpr);
		if (falseResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>)
			return falseResult;

		var cond = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) condResult)
				.value();
		var trueVal = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) trueResult)
				.value();
		var falseVal = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) falseResult)
				.value();

		var branchMarker = new ExpressionModel.ExpressionTerm(-3, (int) trueVal.literalValue(),
				new ExpressionModel.ExpressionTermFlags(0L, '\0', null));
		var elseMarker = new ExpressionModel.ExpressionTerm(-4, (int) falseVal.literalValue(),
				new ExpressionModel.ExpressionTermFlags(0L, '\0', null));

		ArrayList<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(cond.terms());
		allTerms = allTerms.add(branchMarker);
		allTerms = allTerms.addAll(trueVal.terms());
		allTerms = allTerms.add(elseMarker);
		allTerms = allTerms.addAll(falseVal.terms());

		var totalReads = cond.readCount() + trueVal.readCount() + falseVal.readCount();
		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, 0, allTerms));
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionForConditional(
			String expr) {
		// Simplified parser that handles comparisons - delegate to comparison parsing
		// or additive if no comparison
		var e = expr.trim();

		// Handle nested conditionals
		if (e.startsWith("if ("))
			return parseConditional(e);

		// Try is operator (type check)
		var is = DepthAwareSplitter.splitByKeywordAtDepthZero(e, "is");
		if (is.size() > 1)
			return ComparisonOperatorHandler.parseIsExpression(is);

		// Try comparison operators
		var le = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(e, '<', '=');
		if (le.size() > 1)
			return ComparisonOperatorHandler.parseLessOrEqualExpression(le);
		var ge = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(e, '>', '=');
		if (ge.size() > 1)
			return ComparisonOperatorHandler.parseGreaterOrEqualExpression(ge);
		var lt = DepthAwareSplitter.splitByDelimiterAtDepthZero(e, '<');
		if (lt.size() > 1)
			return ComparisonOperatorHandler.parseLessThanExpression(lt);
		var gt = DepthAwareSplitter.splitByDelimiterAtDepthZero(e, '>');
		if (gt.size() > 1)
			return ComparisonOperatorHandler.parseGreaterThanExpression(gt);
		var eq = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(e, '=', '=');
		if (eq.size() > 1)
			return ComparisonOperatorHandler.parseEqualityExpression(eq);
		var neq = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(e, '!', '=');
		if (neq.size() > 1)
			return ComparisonOperatorHandler.parseInequalityExpression(neq);

		// No comparison, parse as additive
		return AdditiveExpressionParser.parseAdditive(e);
	}

	private static int findElseKeyword(String expr) {
		var depth = 0;
		var exprLength = expr.length();
		for (var i = 0; i < exprLength - 3; i++) {
			var c = expr.charAt(i);
			if (c == '(' || c == '{')
				depth++;
			else if (c == ')' || c == '}')
				depth--;
			else if (depth == 0 && expr.startsWith("else", i)) {
				var isPrevValid = i == 0 || !Character.isLetterOrDigit(expr.charAt(i - 1));
				var isNextValid = i + 4 >= exprLength || !Character.isLetterOrDigit(expr.charAt(i + 4));
				if (isPrevValid && isNextValid) {
					return i;
				}
			}
		}
		return -1;
	}

	public static Result<Void, CompileError> buildConditionalAssignmentChain(String varName, String s,
			ArrayList<Instruction> instructions, boolean isFirst) {
		var instr = instructions;
		if (!s.startsWith("if ("))
			return Result.err(new CompileError("Expected 'if'"));
		var cEnd = findConditionEnd(s);
		if (cEnd == -1)
			return Result.err(new CompileError("Malformed"));
		String cond = s.substring(4, cEnd), r = s.substring(cEnd + 1).trim();
		if (!r.startsWith(varName + " =") && !r.startsWith(varName + "="))
			return Result.err(new CompileError("Expected assign"));
		int eqIdx = r.indexOf('='), sIdx = DepthAwareSplitter.findSemicolonAtDepthZero(r, eqIdx);
		if (sIdx == -1)
			return Result.err(new CompileError("Missing ';'"));
		String trueVal = r.substring(eqIdx + 1, sIdx).trim(), r2 = r.substring(sIdx + 1).trim();
		if (!r2.startsWith("else "))
			return Result.err(new CompileError("Expected 'else'"));

		var condCheckResult = validateCondition(cond);
		if (condCheckResult instanceof Result.Err<Void, CompileError>)
			return condCheckResult;

		r2 = r2.substring(5).trim();
		var condRes = App.parseExpressionWithRead(cond);
		if (condRes instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> condErr)
			return Result.err(condErr.error());
		var condExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) condRes)
				.value();
		var genCond = App.generateInstructions(condExpr, instr);
		if (genCond instanceof Result.Err<ArrayList<Instruction>, CompileError> err)
			return Result.err(err.error());
		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, 1, -1L));
		instr = instr.add(new Instruction(Operation.Add, Variant.Immediate, 1, 0L));
		var jumpElseIdx = instr.size();
		instr = instr.add(new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 1L, 0L));

		var trueResult = processTrueBranch(trueVal, instr);
		if (trueResult instanceof Result.Err<Integer, CompileError> trueErr)
			return Result.err(trueErr.error());
		int jumpEndIdx = ((Result.Ok<Integer, CompileError>) trueResult).value();

		instr = instr.set(jumpElseIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 1L, (long) instr.size()));
		var falseResult = processFalseBranch(varName, r2, instr);
		if (falseResult instanceof Result.Err<Void, CompileError>)
			return falseResult;

		instr = instr.set(jumpEndIdx,
				new Instruction(Operation.Jump, Variant.Immediate, 0, (long) instr.size()));
		if (isFirst) {
			instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, 100L));
			instr = instr.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
		}
		return Result.ok(null);
	}

	private static Result<Void, CompileError> validateCondition(String cond) {
		var typeRes = ExpressionTokens.extractTypeFromExpression(cond, new java.util.HashMap<>());
		return typeRes.match(type -> {
			if (!type.equals("Bool")) {
				return Result.err(new CompileError("Expect Bool"));
			}
			return Result.ok(null);
		}, err -> Result.ok(null));
	}

	@SuppressWarnings("CheckReturnValue")
	private static Result<Integer, CompileError> processTrueBranch(String trueVal, ArrayList<Instruction> instructions) {
		var instr = instructions;
		var trueRes = App.parseExpressionWithRead(trueVal);
		if (trueRes instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> trueErr) {
			return Result.err(trueErr.error());
		}
		var trueExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) trueRes)
				.value();
		var genTrue = App.generateInstructions(trueExpr, instr);
		if (genTrue instanceof Result.Err<ArrayList<Instruction>, CompileError> err) {
			return Result.err(err.error());
		}
		instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 100L));
		var jumpEndIdx = instr.size();
		instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, 0L));
		return Result.ok(jumpEndIdx);
	}

	private static Result<Void, CompileError> processFalseBranch(String varName, String r2,
			ArrayList<Instruction> instructions) {
		var instr = instructions;
		var falseBranch = r2;
		var startsWithIf = falseBranch.startsWith("if (");
		if (startsWithIf) {
			return buildConditionalAssignmentChain(varName, falseBranch, instr, false);
		}
		var startsWithVarEq = falseBranch.startsWith(varName + " =") || falseBranch.startsWith(varName + "=");
		if (startsWithVarEq) {
			var eqIdx = falseBranch.indexOf('=');
			var sIdx = DepthAwareSplitter.findSemicolonAtDepthZero(falseBranch, eqIdx);
			if (sIdx == -1)
				return Result.err(new CompileError("Missing ';'"));
			var falseVal = falseBranch.substring(eqIdx + 1, sIdx).trim();
			var remaining = falseBranch.substring(sIdx + 1).trim();
			if (!remaining.equals(varName))
				return Result.err(new CompileError("Bad var"));
			var falseRes = App.parseExpressionWithRead(falseVal);
			if (falseRes instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> falseErr) {
				return Result.err(falseErr.error());
			}
			var falseExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) falseRes)
					.value();
			var genFalse = App.generateInstructions(falseExpr, instr);
			if (genFalse instanceof Result.Err<ArrayList<Instruction>, CompileError> err) {
				return Result.err(err.error());
			}
			instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 100L));
			return Result.ok(null);
		} else
			return Result.err(new CompileError("Bad else"));
	}
}
