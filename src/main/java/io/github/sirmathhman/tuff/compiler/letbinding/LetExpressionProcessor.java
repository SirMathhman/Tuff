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
		Result<String, CompileError> typeResult = ExpressionTokens.extractTypeFromExpression(decl.valueExpr(),
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
		Result<ExpressionTokens.LetBindingDecl, CompileError> declResult = ExpressionTokens.parseLetDeclaration(expr);
		return declResult.match(
				decl -> {

					// Check for duplicate variable binding
					if (boundVariables.containsKey(decl.varName())) {
						return Result.err(new CompileError(
								"Duplicate variable binding: '" + decl.varName() + "' is already bound"));
					}

					// Extract and validate the type
					Result<String, CompileError> actualTypeResult = determineAndValidateType(decl, variableTypes);
					return actualTypeResult.match(
							actualType -> {

								// Now substitute any bound variables in the value expression for actual
								// compilation
								String valueExpr = decl.valueExpr();
								for (String varName : boundVariables.keySet()) {
									// Simple substitution - replace variable references with their bound
									// expressions
									valueExpr = valueExpr.replaceAll("\\b" + varName + "\\b",
											boundVariables.get(varName));
								}

								// Parse the value expression using provided parser
								Result<ExpressionModel.ExpressionResult, CompileError> valueResult = exprParser
										.apply(valueExpr);
								return valueResult.match(
										valueExprResult -> {

											// Find where the first binding ends (after its semicolon)
											int equalsIndex = expr.indexOf('=');
											int semiIndex = expr.indexOf(';', equalsIndex);

											// Get the continuation after the semicolon
											String continuation = expr.substring(semiIndex + 1).trim();

											// Parse the continuation (either another let binding or final variable
											// reference)
											if (continuation.startsWith("let ")) {
												// Another let binding follows - recursively parse it with updated context
												Map<String, String> newVariables = new HashMap<>(boundVariables);
												newVariables.put(decl.varName(), decl.valueExpr());
												Map<String, String> newTypes = new HashMap<>(variableTypes);
												newTypes.put(decl.varName(), actualType);
												return parseLetExpressionBindingWithContext(continuation, newVariables,
														newTypes, exprParser);
											}

											// Should be a variable reference - validate it matches the declared
											// variable
											if (!continuation.equals(decl.varName())) {
												return Result.err(new CompileError("Invalid let binding: expected reference to variable '"
														+ decl.varName() + "' but got '" + continuation + "'"));
											}

											// Return the value expression result (the variable evaluates to its bound
											// value)
											return Result.ok(valueExprResult);
										},
										err -> Result.err(err));
							},
							err -> Result.err(err));
				},
				err -> Result.err(err));
	}
}
