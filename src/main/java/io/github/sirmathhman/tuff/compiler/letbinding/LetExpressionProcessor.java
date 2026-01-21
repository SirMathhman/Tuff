package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.ExpressionTokens;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Processor for let expression binding parsing. Extracted from App.java for
 * size management.
 */
public final class LetExpressionProcessor {
	private LetExpressionProcessor() {
	}

	public static Result<String, CompileError> determineAndValidateType(ExpressionTokens.LetBindingDecl decl,
			Map<String, String> variableTypes) {
		// Extract the type from the value expression BEFORE substitution
		// This allows variable references to be resolved in the type context
		var typeResult = ExpressionTokens.extractTypeFromExpression(decl.valueExpr(),
																																variableTypes);

		// Determine the actual type to use
		if (decl.declaredType() == null) {
			// Type inference: require successful type extraction
			return typeResult.match(Result::ok, Result::err);
		} else {
			// If type is explicitly declared, try to extract type for validation
			return typeResult.match(
					inferredType -> {
						// Validate that the inferred type is compatible with the declared type
						// But skip validation for pointer types (they're complex and require more
						// infrastructure)
						if (!decl.declaredType().startsWith("*")
								&& !ExpressionTokens.isTypeCompatible(inferredType, decl.declaredType())) {
							return Result.err(new CompileError("Type mismatch in let binding: variable '"
									+ decl.varName() + "' declared as " + decl.declaredType() + " but initialized with "
									+ inferredType));
						}
						return Result.ok(decl.declaredType());
					},
					err -> Result.ok(decl.declaredType()));
		}
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLetExpressionBindingWithContext(
			String expr, Map<String, String> boundVariables, Map<String, String> variableTypes,
			Function<String, Result<ExpressionModel.ExpressionResult, CompileError>> exprParser) {
		// Format: let varName : TYPE = EXPR; continuation
		// where continuation is either another let binding or a variable reference
		var declResult = ExpressionTokens.parseLetDeclaration(expr);
		return declResult.match(
				decl -> {

					// Check for duplicate variable binding
					if (boundVariables.containsKey(decl.varName())) {
						return Result.err(new CompileError(
								"Duplicate variable binding: '" + decl.varName() + "' is already bound"));
					}

					// Extract and validate the type
					var actualTypeResult = determineAndValidateType(decl, variableTypes);
					return actualTypeResult.match(
							actualType -> {

								// Now substitute any bound variables in the value expression for actual
								// compilation
								var valueExpr = decl.valueExpr();
								for (var varName : boundVariables.keySet()) {
									// Simple substitution - replace variable references with their bound
									// expressions
									valueExpr = valueExpr.replaceAll("\\b" + varName + "\\b",
											boundVariables.get(varName));
								}

								final var boundValueExpr = "(" + valueExpr + ")";

								// Parse the value expression using provided parser
								var valueResult = exprParser
										.apply(valueExpr);
								return valueResult.match(
										valueExprResult -> {

											// Find where the first binding ends (after its semicolon)
											var equalsIndex = expr.indexOf('=');
											var semiIndex = expr.indexOf(';', equalsIndex);

											// Get the continuation after the semicolon
											var continuation = expr.substring(semiIndex + 1).trim();

											// Parse the continuation (either another let binding or a final expression)
											if (continuation.startsWith("let ")) {
												// Another let binding follows - recursively parse it with updated context
												Map<String, String> newVariables = new HashMap<>(boundVariables);
												newVariables.put(decl.varName(), boundValueExpr);
												Map<String, String> newTypes = new HashMap<>(variableTypes);
												newTypes.put(decl.varName(), actualType);
												return parseLetExpressionBindingWithContext(continuation, newVariables,
														newTypes, exprParser);
											}

											// Otherwise, treat the continuation as an expression in the extended
											// let-binding context (substitute all bound variables, then parse).
											Map<String, String> newVariables = new HashMap<>(boundVariables);
											newVariables.put(decl.varName(), boundValueExpr);
											var continuationExpr = continuation;
											for (var varName : newVariables.keySet()) {
												continuationExpr = continuationExpr.replaceAll("\\b" + varName + "\\b",
														newVariables.get(varName));
											}
											return exprParser.apply(continuationExpr);
										}, Result::err);
							}, Result::err);
				}, Result::err);
	}
}
