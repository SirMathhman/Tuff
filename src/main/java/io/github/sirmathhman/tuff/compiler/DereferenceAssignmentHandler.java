package io.github.sirmathhman.tuff.compiler;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class DereferenceAssignmentHandler {
	private DereferenceAssignmentHandler() {
	}

	public static Result<Void, CompileError> handle(
			String varName,
			String initialValueExpr,
			String continuation,
			List<Instruction> instructions,
			Map<String, Integer> variableAddresses) {
		// For dereference assignments, the initialValueExpr should be a reference like
		// &mut x
		String refTarget = extractReferenceTarget(initialValueExpr);
		if (refTarget == null) {
			return Result.err(new CompileError("Invalid reference expression: " + initialValueExpr));
		}

		// Get the address of the referenced variable
		int referencedAddr;
		if (variableAddresses.containsKey(refTarget)) {
			referencedAddr = variableAddresses.get(refTarget);
		} else {
			return Result.err(new CompileError("Cannot reference undefined variable '" + refTarget + "'"));
		}

		// Map this variable name to the referenced address (it's a pointer to that
		// address)
		Map<String, Integer> addresses = new HashMap<>(variableAddresses);
		addresses.put(varName, referencedAddr);

		// Parse the dereference assignment
		Result<DereferenceAssignmentParseResult, CompileError> parseResult = parse(varName, continuation);
		if (parseResult instanceof Result.Err<DereferenceAssignmentParseResult, CompileError> err) {
			return Result.err(err.error());
		}
		if (!(parseResult instanceof Result.Ok<DereferenceAssignmentParseResult, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing dereference assignment"));
		}
		DereferenceAssignmentParseResult parsed = ok.value();

		// Parse and evaluate assignment value
		Result<ExpressionModel.ExpressionResult, CompileError> exprResult = App.parseExpressionWithRead(
				parsed.valueExpr());
		if (exprResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> exprErr) {
			return Result.err(exprErr.error());
		}
		if (!(exprResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> exprOk)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing assignment expression"));
		}

		// Generate instructions for assignment value
		Result<Void, CompileError> assignGenResult = App.generateInstructions(exprOk.value(), instructions);
		if (assignGenResult instanceof Result.Err<Void, CompileError>) {
			return assignGenResult;
		}

		// Store the computed value to the dereferenced address
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) referencedAddr));

		// Handle the remaining continuation
		String remaining = parsed.remaining();
		if (remaining.isEmpty()) {
			instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		// If remaining is a variable reference, load it
		if (addresses.containsKey(remaining)) {
			DepthAwareSplitter.addLoadAndHalt(instructions, addresses.get(remaining));
			return Result.ok(null);
		}

		return Result.err(new CompileError("Unsupported continuation after dereference assignment: " + remaining));
	}

	private static Result<DereferenceAssignmentParseResult, CompileError> parse(String varName,
			String continuation) {
		// Pattern: *varName = value; remaining
		String trimmed = continuation.trim();
		String assignTarget = "*" + varName;

		if (!trimmed.startsWith(assignTarget + " ") && !trimmed.startsWith(assignTarget + "=")) {
			return Result.err(new CompileError("Invalid dereference assignment"));
		}

		int assignEqIndex = continuation.indexOf('=');
		if (assignEqIndex == -1 || !continuation.substring(0, assignEqIndex).trim().equals(assignTarget)) {
			return Result.err(new CompileError("Invalid dereference assignment"));
		}

		// Find semicolon with depth tracking for nested structures
		int assignSemiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(continuation, assignEqIndex);
		if (assignSemiIndex == -1) {
			return Result.err(new CompileError("Invalid dereference assignment: missing ';'"));
		}

		// Extract assignment value expression and remaining continuation
		String valueExpr = continuation.substring(assignEqIndex + 1, assignSemiIndex).trim();
		String remaining = continuation.substring(assignSemiIndex + 1).trim();

		return Result.ok(new DereferenceAssignmentParseResult(valueExpr, remaining));
	}

	public static String extractReferenceTarget(String refExpr) {
		// Extract variable name from expressions like "&x", "&mut x"
		String trimmed = refExpr.trim();
		if (!trimmed.startsWith("&")) {
			return null;
		}
		String afterAmp = trimmed.substring(1).trim();
		if (afterAmp.startsWith("mut ")) {
			afterAmp = afterAmp.substring(4).trim();
		}
		// Extract the variable name (first word)
		int spaceIndex = afterAmp.indexOf(' ');
		return spaceIndex > 0 ? afterAmp.substring(0, spaceIndex) : (afterAmp.isEmpty() ? null : afterAmp);
	}

	private record DereferenceAssignmentParseResult(String valueExpr, String remaining) {
	}
}
