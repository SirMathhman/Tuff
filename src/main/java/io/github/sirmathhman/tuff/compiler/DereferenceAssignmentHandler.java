package io.github.sirmathhman.tuff.compiler;

import java.util.HashMap;
import io.github.sirmathhman.tuff.lib.ArrayList;
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
			ArrayList<Instruction> instructions,
			Map<String, Integer> variableAddresses) {
		var instr = instructions;
		// For dereference assignments, the initialValueExpr should be a reference like
		// &mut x
		var refTarget = extractReferenceTarget(initialValueExpr);
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
		var parseResult = parse(varName, continuation);
		if (parseResult instanceof Result.Err<DereferenceAssignmentParseResult, CompileError> err) {
			return Result.err(err.error());
		}
		if (!(parseResult instanceof Result.Ok<DereferenceAssignmentParseResult, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing dereference assignment"));
		}
		var parsed = ok.value();

		// Parse and evaluate assignment value
		var exprResult = App.parseExpressionWithRead(
				parsed.valueExpr());
		if (exprResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> exprErr) {
			return Result.err(exprErr.error());
		}
		if (!(exprResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> exprOk)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing assignment expression"));
		}

		// Generate instructions for assignment value
		var assignGenResult = App.generateInstructions(exprOk.value(), instr);
		if (assignGenResult instanceof Result.Err<Void, CompileError>) {
			return assignGenResult;
		}

		// Store the computed value to the dereferenced address
		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) referencedAddr));

		// Handle the remaining continuation
		var remaining = parsed.remaining();
		if (remaining.isEmpty()) {
			instr = instr.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		// If remaining is a variable reference, load it
		if (addresses.containsKey(remaining)) {
			DepthAwareSplitter.addLoadAndHalt(instr, addresses.get(remaining));
			return Result.ok(null);
		}

		return Result.err(new CompileError("Unsupported continuation after dereference assignment: " + remaining));
	}

	private static Result<DereferenceAssignmentParseResult, CompileError> parse(String varName,
			String continuation) {
		// Pattern: *varName = value; remaining
		var trimmed = continuation.trim();
		var assignTarget = "*" + varName;

		if (!trimmed.startsWith(assignTarget + " ") && !trimmed.startsWith(assignTarget + "=")) {
			return Result.err(new CompileError("Invalid dereference assignment"));
		}

		var assignEqIndex = continuation.indexOf('=');
		if (assignEqIndex == -1 || !continuation.substring(0, assignEqIndex).trim().equals(assignTarget)) {
			return Result.err(new CompileError("Invalid dereference assignment"));
		}

		// Find semicolon with depth tracking for nested structures
		var assignSemiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(continuation, assignEqIndex);
		if (assignSemiIndex == -1) {
			return Result.err(new CompileError("Invalid dereference assignment: missing ';'"));
		}

		// Extract assignment value expression and remaining continuation
		var valueExpr = continuation.substring(assignEqIndex + 1, assignSemiIndex).trim();
		var remaining = continuation.substring(assignSemiIndex + 1).trim();

		return Result.ok(new DereferenceAssignmentParseResult(valueExpr, remaining));
	}

	public static String extractReferenceTarget(String refExpr) {
		// Extract variable name from expressions like "&x", "&mut x"
		var trimmed = refExpr.trim();
		if (!trimmed.startsWith("&")) {
			return null;
		}
		var afterAmp = trimmed.substring(1).trim();
		if (afterAmp.startsWith("mut ")) {
			afterAmp = afterAmp.substring(4).trim();
		}
		// Extract the variable name (first word)
		var spaceIndex = afterAmp.indexOf(' ');
		if (spaceIndex > 0) {
			return afterAmp.substring(0, spaceIndex);
		} else {
			if (afterAmp.isEmpty())
				return null;
			return afterAmp;
		}
	}

	private record DereferenceAssignmentParseResult(String valueExpr, String remaining) {
	}
}
