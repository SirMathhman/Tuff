package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.compiler.AdditiveExpressionParser;
import io.github.sirmathhman.tuff.compiler.ComparisonOperatorHandler;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.functions.RecursiveFunctionCompiler;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionCallSubstituter;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.compiler.InstructionBuilder;
import io.github.sirmathhman.tuff.compiler.LetBindingHandler;
import io.github.sirmathhman.tuff.compiler.LogicalOperatorHandler;
import io.github.sirmathhman.tuff.compiler.MultiplicativeExpressionBuilder;
import io.github.sirmathhman.tuff.compiler.WhileLoopHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.LetBindingProcessor;
import io.github.sirmathhman.tuff.compiler.letbinding.LetExpressionProcessor;
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
					new HashMap<>(), new HashMap<>(), new HashMap<>());
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
		return parseStatement(stmt, instructions, new HashSet<>(), new HashMap<>(), new HashMap<>(), new HashMap<>());
	}

	private static Result<Void, CompileError> parseStatement(String stmt, List<Instruction> instructions,
			Set<String> definedStructs, Map<String, StructDefinition> structRegistry,
			Map<String, FunctionHandler.FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		if (FunctionHandler.isFunctionDefinition(stmt)) {
			return FunctionHandler.parseFunctionDefinition(stmt, capturedVariables).flatMap(parsedFunc -> {
				functionRegistry.put(parsedFunc.functionDef().name(), parsedFunc.functionDef());
				if (parsedFunc.remaining().isEmpty()) {
					return Result.ok(null);
				}
				return parseStatement(parsedFunc.remaining(), instructions, definedStructs, structRegistry,
						functionRegistry, capturedVariables);
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
									functionRegistry, capturedVariables);
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

		// Check if this is a call to a recursive function
		Result<Void, CompileError> recursiveResult = RecursiveFunctionCompiler.tryCompileRecursiveCall(
				stmt, instructions, functionRegistry);
		if (recursiveResult != null) {
			return recursiveResult;
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

		// Find the assignment '=' at depth 0 (not inside the type annotation like in
		// '=>')
		int equalsIndex = findAssignmentEqualsAtDepthZero(stmt);

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
					return parseStatement(remaining, instructions, definedStructs, structRegistry, new HashMap<>(),
							new HashMap<>());
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
					return parseStatement(fieldResult.remaining(), instructions, definedStructs, structRegistry, new HashMap<>(),
							new HashMap<>());
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
			return parseLetExpressionBinding(expr, new HashMap<>());
		}

		// Check if this is a match expression
		if (MatchExpressionHandler.hasMatch(expr)) {
			return MatchExpressionHandler.parseMatch(expr);
		}

		// Check if this is a conditional expression (lowest precedence)
		if (ConditionalExpressionHandler.hasConditional(expr)) {
			return ConditionalExpressionHandler.parseConditional(expr);
		}

		// Check if this is a function definition (before normalizing braces!)
		if (FunctionHandler.isFunctionDefinition(expr)) {
			Map<String, FunctionHandler.FunctionDef> functionRegistry = new HashMap<>();
			return parseExpressionWithRead(expr, functionRegistry, new HashMap<>());
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
		return parseExpressionWithRead(expr, functionRegistry, new HashMap<>());
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionWithRead(String expr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry, Map<String, String> capturedVariables) {
		expr = expr.trim();

		// Normalize ALL occurrences of this.functionName() to functionName() using
		// regex
		// This handles cases like "this.a() + this.b()" in arithmetic expressions
		expr = expr.replaceAll("\\bthis\\.([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(", "$1(");

		// Check if this is a function definition
		if (FunctionHandler.isFunctionDefinition(expr)) {
			return FunctionHandler.parseFunctionDefinition(expr, capturedVariables).flatMap(parsedFunc -> {
				// Register the function
				functionRegistry.put(parsedFunc.functionDef().name(), parsedFunc.functionDef());
				// If there's remaining code, parse it
				if (parsedFunc.remaining().isEmpty()) {
					// Just the function definition with no call
					List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
					ExpressionModel.ExpressionResult zeroResult = new ExpressionModel.ExpressionResult(0, 0, terms);
					return Result.ok(zeroResult);
				}
				// Parse remaining expression (should be function call or another definition)
				return parseExpressionWithRead(parsedFunc.remaining(), functionRegistry, capturedVariables);
			});
		}

		// Check if this is a function call with field access (e.g., get(100).value)
		Result<ExpressionModel.ExpressionResult, CompileError> fieldAccessResult = FunctionHandler
				.tryParseFunctionCallWithFieldAccess(expr, functionRegistry, capturedVariables);
		if (fieldAccessResult != null) {
			return fieldAccessResult;
		}

		// Check if this is a function call
		if (FunctionHandler.isFunctionCall(expr, functionRegistry, capturedVariables)) {
			return FunctionHandler.parseFunctionCall(expr, functionRegistry, capturedVariables)
					.flatMap(body -> parseExpressionWithRead(body, functionRegistry, capturedVariables));
		}

		// Substitute all function calls in the expression before parsing
		Result<String, CompileError> substitutedResult = FunctionCallSubstituter.substituteAllFunctionCalls(expr,
				functionRegistry);
		if (substitutedResult instanceof Result.Err<String, CompileError> err) {
			return Result.err(err.error());
		}
		String substitutedExpr = ((Result.Ok<String, CompileError>) substitutedResult).value();

		// Check if this is a bare function name (function reference, not a call)
		if (functionRegistry.containsKey(substitutedExpr)) {
			// Return a zero result for function references - they don't produce a value
			// themselves
			List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
			ExpressionModel.ExpressionResult zeroResult = new ExpressionModel.ExpressionResult(0, 0, terms);
			return Result.ok(zeroResult);
		}

		// Otherwise use the standard parsing without function registry
		return parseExpressionWithRead(substitutedExpr);
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseComparisonOperators(String expr) {
		return ComparisonOperatorHandler.parseAllComparisons(expr);
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseLetExpressionBinding(String expr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		return LetExpressionProcessor.parseLetExpressionBindingWithContext(expr, new java.util.HashMap<>(),
				new java.util.HashMap<>(), valueExpr -> parseExpressionWithRead(valueExpr, functionRegistry));
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

	private static int findAssignmentEqualsAtDepthZero(String stmt) {
		int depth = 0;
		for (int i = 4; i < stmt.length(); i++) { // Start after "let "
			char c = stmt.charAt(i);
			// Track parenthesis depth
			if (c == '(') {
				depth++;
			} else if (c == ')') {
				depth--;
			}
			// At depth 0, look for the assignment '=' that's not part of '=>'
			if (depth == 0 && c == '=' && i + 1 < stmt.length() && stmt.charAt(i + 1) != '>') {
				// Check if this '=' is not preceded by '=' (to exclude '==')
				if (i == 0 || stmt.charAt(i - 1) != '=') {
					return i;
				}
			}
		}
		return -1;
	}
}