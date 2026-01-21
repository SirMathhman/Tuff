package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.compiler.AdditiveExpressionParser;
import io.github.sirmathhman.tuff.compiler.ComparisonOperatorHandler;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.ExpressionTokens;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.compiler.InstructionBuilder;
import io.github.sirmathhman.tuff.compiler.LetBindingHandler;
import io.github.sirmathhman.tuff.compiler.LogicalOperatorHandler;
import io.github.sirmathhman.tuff.compiler.MultiplicativeExpressionBuilder;
import io.github.sirmathhman.tuff.compiler.WhileLoopHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.LetBindingProcessor;
import io.github.sirmathhman.tuff.compiler.letbinding.MatchExpressionHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.StructHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.StructDefinition;
import io.github.sirmathhman.tuff.compiler.letbinding.StructInstantiationHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.FieldAccessHandler;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.vm.Vm;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class App {
	private App() {
	}

	public static Result<Instruction[], CompileError> compile(String source) {
		List<Instruction> instructions = new ArrayList<>();
		if (!source.isEmpty()) {
			Result<Void, CompileError> result = parseStatement(source.trim(), instructions, new HashSet<>(),
					new HashMap<>(), new HashMap<>());
			return result.match(
					ignored -> {
						instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, null));
						return Result.ok(instructions.toArray(new Instruction[0]));
					},
					Result::err);
		}

		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, null));
		return Result.ok(instructions.toArray(new Instruction[0]));
	}

	public static Result<Void, CompileError> parseStatement(String stmt, List<Instruction> instructions) {
		return parseStatement(stmt, instructions, new HashSet<>(), new HashMap<>(), new HashMap<>());
	}

	private static Result<Void, CompileError> parseStatement(String stmt, List<Instruction> instructions,
			Set<String> definedStructs, Map<String, StructDefinition> structRegistry,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		if (FunctionHandler.isFunctionDefinition(stmt)) {
			return FunctionHandler.parseFunctionDefinition(stmt).flatMap(parsedFunc -> {
				functionRegistry.put(parsedFunc.functionDef().name(), parsedFunc.functionDef());
				if (parsedFunc.remaining().isEmpty()) {
					return Result.ok(null);
				}
				return parseStatement(parsedFunc.remaining(), instructions, definedStructs, structRegistry,
						functionRegistry);
			});
		}

		// Check if this is a struct definition at statement level
		if (stmt.startsWith("struct ")) {
			return StructHandler.parseStructWithRegistry(stmt, definedStructs, structRegistry)
					.flatMap(structResult -> {
						Result<Void, CompileError> instructionsResult = generateInstructions(
								structResult.expressionResult(), instructions);
						return instructionsResult.flatMap(ignored -> {
							if (structResult.remaining().isEmpty()) {
								return Result.ok(null);
							}
							return parseStatement(structResult.remaining(), instructions, definedStructs, structRegistry,
									functionRegistry);
						});
					});
		}
		if (stmt.startsWith("while (")) {
			return handleTopLevelWhileLoop(stmt, instructions);
		}
		if (stmt.startsWith("let ")) {
			return handleLetBindingStatement(stmt, instructions, definedStructs, structRegistry, functionRegistry);
		}
		if (StructInstantiationHandler.isStructInstantiation(stmt, structRegistry)) {
			return handleStructInstantiationStatement(stmt, instructions, definedStructs, structRegistry);
		}

		// Parse as expression (which may contain "read")
		return parseExpressionWithRead(stmt, functionRegistry)
				.flatMap(expr -> generateInstructions(expr, instructions));
	}

	private static Result<Void, CompileError> handleLetBindingStatement(String stmt, List<Instruction> instructions,
			Set<String> definedStructs, Map<String, StructDefinition> structRegistry,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Peek ahead to see if this is a chained let binding
		// Format: "let x = expr1; let y = expr2; z"
		// vs single: "let x = expr; x"
		// vs uninitialized: "let x : Type; x = expr; x"

		int equalsIndex = stmt.indexOf('=');

		// First, find the first semicolon to check for uninitialized declarations
		int firstSemiIndex = stmt.indexOf(';');
		if (firstSemiIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing ';'"));
		}

		// If semicolon comes before equals, this is an uninitialized declaration
		if (equalsIndex == -1 || firstSemiIndex < equalsIndex) {
			String continuation = stmt.substring(firstSemiIndex + 1).trim();
			return LetBindingHandler.handleUninitializedVariable(stmt, firstSemiIndex, continuation, instructions);
		}

		// Find the first semicolon at depth 0 after the equals
		int semiIndex = -1;
		int depth = 0;
		for (int i = equalsIndex; i < stmt.length(); i++) {
			char c = stmt.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ';' && depth == 0) {
				semiIndex = i;
				break;
			}
		}

		if (semiIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing ';'"));
		}

		// Check what comes after the semicolon
		String continuation = stmt.substring(semiIndex + 1).trim();

		// Use LetBindingHandler for all statement-level let bindings
		// (both single and chained)
		return LetBindingHandler.handleLetBindingWithContinuation(stmt, equalsIndex, semiIndex, continuation,
				new LetBindingProcessor.ProcessContext(instructions, new java.util.HashMap<>(), 100, structRegistry,
						functionRegistry));
	}

	private static Result<Void, CompileError> handleStructInstantiationStatement(String stmt,
			List<Instruction> instructions, Set<String> definedStructs, Map<String, StructDefinition> structRegistry) {
		return StructInstantiationHandler.parseStructInstantiation(stmt, structRegistry)
				.flatMap(instResult -> {
					// Struct instantiation evaluates to the value of its first field
					StructDefinition definition = instResult.definition();
					Map<String, String> fieldValues = instResult.fieldValues();

					if (definition.fields().isEmpty()) {
						// Empty struct - return 0
						List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
						ExpressionModel.ExpressionResult zeroResult = new ExpressionModel.ExpressionResult(0, 0, terms);
						Result<Void, CompileError> zeroInstructions = generateInstructions(zeroResult, instructions);
						if (zeroInstructions instanceof Result.Err<Void, CompileError>) {
							return zeroInstructions;
						}
					} else {
						// Get first field value expression and evaluate it
						String firstFieldName = definition.fields().get(0).name();
						String firstFieldExpr = fieldValues.get(firstFieldName);
						if (firstFieldExpr == null) {
							return Result.err(new CompileError("Missing value for field: " + firstFieldName));
						}

						// Parse the first field expression
						Result<ExpressionModel.ExpressionResult, CompileError> fieldExprResult = parseExpressionWithRead(
								firstFieldExpr);
						if (fieldExprResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>) {
							return Result.err(
									((Result.Err<ExpressionModel.ExpressionResult, CompileError>) fieldExprResult)
											.error());
						}
						ExpressionModel.ExpressionResult fieldExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) fieldExprResult)
								.value();

						// Generate instructions for the first field expression
						Result<Void, CompileError> fieldInstructions = generateInstructions(fieldExpr, instructions);
						if (fieldInstructions instanceof Result.Err<Void, CompileError>) {
							return fieldInstructions;
						}
					}

					// Handle any remaining code (field access or continuation)
					String remaining = instResult.remaining();
					if (remaining.isEmpty()) {
						return Result.ok(null);
					}
					// If there's field access or more code, parse it
					if (FieldAccessHandler.hasFieldAccess(remaining)) {
						return handleFieldAccessStatement(remaining, instResult.definition(), instructions,
								definedStructs, structRegistry);
					}
					return parseStatement(remaining, instructions, definedStructs, structRegistry, new HashMap<>());
				});
	}
	private static Result<Void, CompileError> handleFieldAccessStatement(String stmt,
			StructDefinition structDef, List<Instruction> instructions, Set<String> definedStructs,
			Map<String, StructDefinition> structRegistry) {
		return FieldAccessHandler.parseFieldAccess(stmt, structRegistry)
				.flatMap(fieldResult -> {
					// Field access on a struct is a no-op - the struct instantiation
					// already evaluated to its first field value, so the value is already
					// in register 0. Just continue parsing remaining code.
					if (fieldResult.remaining().isEmpty()) {
						return Result.ok(null);
					}
					return parseStatement(fieldResult.remaining(), instructions, definedStructs, structRegistry, new HashMap<>());
				});
	}
	public static Result<Void, CompileError> generateInstructions(ExpressionModel.ExpressionResult expr,
			List<Instruction> instructions) {
		boolean hasControlMarkers = expr.terms.stream().anyMatch(t -> t.readCount < 0);
		boolean hasReads = expr.terms.stream().anyMatch(t -> t.readCount > 0);
		if (!hasReads && !hasControlMarkers) {
			// Constant expression: always overwrite result (avoid `result += literal`).
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, expr.literalValue));
		} else {
			// Load all reads into registers
			InstructionBuilder.loadAllReads(expr.terms, instructions);

			// Apply masking for bitwise-notted unsigned types
			int readReg = 0;
			for (ExpressionModel.ExpressionTerm term : expr.terms) {
				if (term.readCount > 0) {
					if (term.isBitwiseNotted() && term.readTypeSpec != null && term.readTypeSpec.matches("[UI]\\d+")) {
						int bits = Integer.parseInt(term.readTypeSpec.substring(1));
						long mask = (1L << bits) - 1;
						// Use a temporary register for the mask value
						int tempReg = expr.terms.size() + 1; // Use a register beyond all reads
						instructions.add(new Instruction(Operation.Load, Variant.Immediate, tempReg, mask));
						instructions.add(new Instruction(Operation.BitsAnd, Variant.Immediate, readReg, (long) tempReg));
					}
					readReg++;
				}
			}

			// Build result respecting precedence
			int resultReg = InstructionBuilder.buildResultWithPrecedence(expr.terms, instructions);

			// Add literal if present
			if (expr.literalValue != 0) {
				InstructionBuilder.addLiteralToResult(resultReg, expr.literalValue, expr.terms.size(), instructions);
			}
		}

		return Result.ok(null);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionWithRead(String expr) {
		expr = expr.trim();
		// Check if this is a let binding
		if (expr.startsWith("let ")) {
			return parseLetExpressionBinding(expr);
		}

		// Check if this is a match expression
		if (MatchExpressionHandler.hasMatch(expr)) {
			return MatchExpressionHandler.parseMatch(expr);
		}

		// Check if this is a conditional expression (lowest precedence)
		if (ConditionalExpressionHandler.hasConditional(expr)) {
			return ConditionalExpressionHandler.parseConditional(expr);
		}

		// Check if this is a struct instantiation (before normalizing braces!)
		if (StructInstantiationHandler.isStructInstantiation(expr, new java.util.HashMap<>())) {
			Result<StructInstantiationHandler.StructInstantiationResult, CompileError> structResult = StructInstantiationHandler
					.parseStructInstantiation(expr, new java.util.HashMap<>());
			if (structResult instanceof Result.Ok<StructInstantiationHandler.StructInstantiationResult, CompileError> ok) {
				// Return the struct instantiation result directly
				return Result.ok(ok.value().expressionResult());
			}
		}

		// Normalize curly braces to parentheses for uniform grouping support
		expr = expr.replace('{', '(').replace('}', ')');
		// Split by || (logical OR) first - lowest precedence
		List<String> orTokens = LogicalOperatorHandler.splitByLogicalOr(expr);
		if (orTokens.size() > 1) {
			// We have logical OR operations - parse each side and combine
			return LogicalOperatorHandler.parseLogicalOrExpression(orTokens);
		}

		// Split by && (logical AND) - higher precedence than OR
		List<String> andTokens = LogicalOperatorHandler.splitByLogicalAnd(expr);
		if (andTokens.size() > 1) {
			// We have logical AND operations - parse each side and combine
			return LogicalOperatorHandler.parseLogicalAndExpression(andTokens);
		}

		final String normalizedExpr = expr;
		// Try comparison operators (all at same precedence level)
		Result<ExpressionModel.ExpressionResult, CompileError> comparisonResult = parseComparisonOperators(normalizedExpr);
		return comparisonResult.match(
				Result::ok,
				err -> AdditiveExpressionParser.parseAdditive(normalizedExpr));
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionWithRead(String expr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		expr = expr.trim();

		// Check if this is a function call
		if (FunctionHandler.isFunctionCall(expr, functionRegistry)) {
			return FunctionHandler.parseFunctionCall(expr, functionRegistry)
					.flatMap(App::parseExpressionWithRead);
		}

		// Otherwise use the standard parsing without function registry
		return parseExpressionWithRead(expr);
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseComparisonOperators(String expr) {
		var le = ComparisonOperatorHandler.splitByLessOrEqual(expr);
		if (le.size() > 1)
			return ComparisonOperatorHandler.parseLessOrEqualExpression(le);
		var ge = ComparisonOperatorHandler.splitByGreaterOrEqual(expr);
		if (ge.size() > 1)
			return ComparisonOperatorHandler.parseGreaterOrEqualExpression(ge);
		var lt = ComparisonOperatorHandler.splitByLessThan(expr);
		if (lt.size() > 1)
			return ComparisonOperatorHandler.parseLessThanExpression(lt);
		var gt = ComparisonOperatorHandler.splitByGreaterThan(expr);
		if (gt.size() > 1)
			return ComparisonOperatorHandler.parseGreaterThanExpression(gt);
		var eq = ComparisonOperatorHandler.splitByEquality(expr);
		if (eq.size() > 1)
			return ComparisonOperatorHandler.parseEqualityExpression(eq);
		var neq = ComparisonOperatorHandler.splitByInequality(expr);
		if (neq.size() > 1)
			return ComparisonOperatorHandler.parseInequalityExpression(neq);
		return Result.err(new CompileError("No comparison operator found"));
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseLetExpressionBinding(String expr) {
		return parseLetExpressionBindingWithContext(expr, new java.util.HashMap<>(), new java.util.HashMap<>());
	}

	private static Result<String, CompileError> determineAndValidateType(
			ExpressionTokens.LetBindingDecl decl,
			java.util.Map<String, String> variableTypes) {
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
							return Result.err(new CompileError("Type mismatch in let binding: variable '" + decl.varName() +
									"' declared as " + decl.declaredType() + " but initialized with " + inferredType));
						}
						return Result.ok(decl.declaredType());
					},
					err -> Result.ok(decl.declaredType()));
		}
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLetExpressionBindingWithContext(
			String expr,
			java.util.Map<String, String> boundVariables, java.util.Map<String, String> variableTypes) {
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

								// Parse the value expression
								Result<ExpressionModel.ExpressionResult, CompileError> valueResult = parseExpressionWithRead(
										valueExpr);
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
												java.util.Map<String, String> newVariables = new java.util.HashMap<>(boundVariables);
												newVariables.put(decl.varName(), decl.valueExpr());
												java.util.Map<String, String> newTypes = new java.util.HashMap<>(variableTypes);
												newTypes.put(decl.varName(), actualType);
												return parseLetExpressionBindingWithContext(continuation, newVariables, newTypes);
											}

											// Should be a variable reference - validate it matches the declared variable
											if (!continuation.equals(decl.varName())) {
												return Result.err(new CompileError("Invalid let binding: expected reference to variable '" +
														decl.varName() + "' but got '" + continuation + "'"));
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

	public static Result<ExpressionModel.ParsedMult, CompileError> parseMultiplicative(String expr,
			boolean isSubtracted) {
		return MultiplicativeExpressionBuilder.parseMultiplicative(expr, isSubtracted, App::parseExpressionWithRead);
	}

	public static Result<RunResult, ApplicationError> run(String source, int[] input) {
		return compile(source).match(
				instructions -> {
					final int[] inputPointer = { 0 };
					List<Integer> output = new ArrayList<>();
					try {
						int returnValue = Vm.execute(
								instructions,
								() -> {
									if (inputPointer[0] >= input.length) {
										return 0;
									}
									return input[inputPointer[0]++];
								},
								output::add);

						return Result.ok(new RunResult(output, returnValue, instructions));
					} catch (Exception e) {
						e.printStackTrace();
						System.err.println("Exception occurred during execution!");
						return Result.err(new ApplicationError(new ExecutionError(instructions)));
					}
				},
				err -> Result.err(new ApplicationError(err)));
	}

	private static Result<Void, CompileError> handleTopLevelWhileLoop(String stmt, List<Instruction> instructions) {
		int condEnd = -1, depth = 1;
		for (int i = 7; i < stmt.length() && depth > 0; i++) {
			if (stmt.charAt(i) == '(')
				depth++;
			else if (stmt.charAt(i) == ')')
				depth--;
			if (depth == 0) {
				condEnd = i;
				break;
			}
		}
		if (condEnd == -1)
			return Result.err(new CompileError("Malformed while loop: missing closing paren"));

		String remaining = stmt.substring(condEnd + 1).trim();
		return WhileLoopHandler.handleWhileLoop(stmt, remaining, instructions, new java.util.HashMap<>());
	}
}