package io.github.sirmathhman.tuff.compiler.functions;

import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.vm.Instruction;

/**
 * Handles function definition and lambda binding in let statements.
 */
public final class FunctionBindingHandler {
	private FunctionBindingHandler() {
	}

	public static boolean isAnonymousFunction(String expr) {
		// Detect lambda pattern: () => body or (params) => body
		var e = expr.trim();
		return e.matches("^\\(.*?\\)\\s*=>.*");
	}

	public static String convertAnonymousFunctionToNamed(String varName, String lambdaExpr) {
		// Convert: () => 100 to: fn varName() => 100
		var e = lambdaExpr.trim();
		var arrowIndex = e.indexOf("=>");
		if (arrowIndex == -1) {
			return e;
		}
		var params = e.substring(0, arrowIndex).trim();
		var body = e.substring(arrowIndex + 2).trim();
		return "fn " + varName + params + " => " + body;
	}

	public static Result<Void, CompileError> handleFunctionDefinitionBinding(String varName, String funcDefStmt,
			String continuation, ArrayList<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Parse the function definition
		var parseResult = FunctionHandler
				.parseFunctionDefinition(funcDefStmt);
		if (parseResult instanceof Result.Err<FunctionHandler.ParsedFunction, CompileError> err) {
			return Result.err(err.error());
		}

		var parsed = ((Result.Ok<FunctionHandler.ParsedFunction, CompileError>) parseResult)
				.value();
		Map<String, FunctionHandler.FunctionDef> updatedRegistry = new java.util.HashMap<>(functionRegistry);
		updatedRegistry.put(varName, parsed.functionDef());

		// Continue with the rest of the statement
		var contResult = io.github.sirmathhman.tuff.App
				.parseExpressionWithRead(continuation, updatedRegistry);
		return contResult.match(expr -> io.github.sirmathhman.tuff.App.generateInstructions(expr, instructions),
				Result::err);
	}
}
