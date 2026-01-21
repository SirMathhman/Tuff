package io.github.sirmathhman.tuff.compiler.functions;

import java.util.List;
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
		expr = expr.trim();
		return expr.matches("^\\(.*?\\)\\s*=>.*");
	}

	public static String convertAnonymousFunctionToNamed(String varName, String lambdaExpr) {
		// Convert: () => 100 to: fn varName() => 100
		lambdaExpr = lambdaExpr.trim();
		int arrowIndex = lambdaExpr.indexOf("=>");
		if (arrowIndex == -1) {
			return lambdaExpr;
		}
		String params = lambdaExpr.substring(0, arrowIndex).trim();
		String body = lambdaExpr.substring(arrowIndex + 2).trim();
		return "fn " + varName + params + " => " + body;
	}

	public static Result<Void, CompileError> handleFunctionDefinitionBinding(String varName, String funcDefStmt,
			String continuation, List<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Parse the function definition
		Result<FunctionHandler.ParsedFunction, CompileError> parseResult = FunctionHandler
				.parseFunctionDefinition(funcDefStmt);
		if (parseResult instanceof Result.Err<FunctionHandler.ParsedFunction, CompileError> err) {
			return Result.err(err.error());
		}

		FunctionHandler.ParsedFunction parsed = ((Result.Ok<FunctionHandler.ParsedFunction, CompileError>) parseResult)
				.value();
		Map<String, FunctionHandler.FunctionDef> updatedRegistry = new java.util.HashMap<>(functionRegistry);
		updatedRegistry.put(varName, parsed.functionDef());

		// Continue with the rest of the statement
		Result<io.github.sirmathhman.tuff.compiler.ExpressionModel.ExpressionResult, CompileError> contResult = io.github.sirmathhman.tuff.App
				.parseExpressionWithRead(continuation, updatedRegistry);
		return contResult.match(expr -> io.github.sirmathhman.tuff.App.generateInstructions(expr, instructions),
				Result::err);
	}
}
