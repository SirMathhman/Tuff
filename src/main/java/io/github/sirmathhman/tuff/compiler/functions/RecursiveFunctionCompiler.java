package io.github.sirmathhman.tuff.compiler.functions;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compiles recursive functions by transforming them to iterative form.
 * <p>
 * Supports pattern: fn name() =&gt; { let var = read TYPE; if (var &lt;= 0) 0
 * else var + name() }
 * This pattern sums all positive inputs, which can be done iteratively.
 */
public final class RecursiveFunctionCompiler {

	private RecursiveFunctionCompiler() {
	}

	/** Check if function contains a recursive call to itself. */
	public static boolean isRecursive(String funcName, String body) {
		return Pattern.compile("\\b" + Pattern.quote(funcName) + "\\s*\\(").matcher(body).find();
	}

	/**
	 * Try to compile a statement as a recursive function call.
	 * Returns null if the statement is not a recursive function call.
	 */
	public static Result<Void, CompileError> tryCompileRecursiveCall(String stmt,
			List<Instruction> instructions, Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		stmt = stmt.trim();
		// Check if stmt is "funcName()" or "funcName(arg)"
		var callPattern = Pattern.compile("^(\\w+)\\s*\\((.*)\\)$");
		var m = callPattern.matcher(stmt);
		if (!m.matches()) {
			return null; // Not a function call
		}
		var funcName = m.group(1);
		var args = m.group(2).trim();
		var funcDef = functionRegistry.get(funcName);
		if (funcDef == null) {
			return null; // Function not defined
		}
		// Check if the function is recursive
		if (!isRecursive(funcName, funcDef.body())) {
			// Try to detect a mutually-recursive cycle like: a() -> b() -> c() -> a()
			var mutual = tryParseMutualReadSumCycle(funcName, functionRegistry);
			if (mutual == null) {
				return null; // Not recursive, use normal path
			}
			if (mutual instanceof Result.Err<ParsedPattern, CompileError> err) {
				return Result.err(err.error());
			}
			var pattern = ((Result.Ok<ParsedPattern, CompileError>) mutual).value();
			return compileReadSumLoop(pattern, instructions);
		}
		// Compile using recursive function compiler
		return compileRecursiveFunction(funcDef, args, instructions);
	}

	/**
	 * Compile a tail-additive recursive function to iterative form.
	 * <p>
	 * Pattern: fn name(n : Type) => if (n <= 0) 0 else n + name(n - 1)
	 * Or: fn name() => { let n = read TYPE; if (n <= 0) 0 else n + name() }
	 * Becomes: result=0; loop { n=eval_arg; if n<=0 break; result+=n }; return
	 * result
	 */
	public static Result<Void, CompileError> compileRecursiveFunction(
			FunctionHandler.FunctionDef funcDef,
			String callArgs,
			List<Instruction> instructions) {

		var funcName = funcDef.name();
		var body = funcDef.body().trim();

		// Try tree recursion first (e.g., Fibonacci with two recursive calls)
		if (!funcDef.params().isEmpty() && !callArgs.trim().isEmpty()) {
			var treeResult = TreeRecursionCompiler.tryCompileTreeRecursion(
					funcDef, callArgs, instructions);
			if (treeResult != null) {
				return treeResult;
			}
		}

		// Try parametric recursion (fn name(n : Type) => ...)
		if (!funcDef.params().isEmpty() && !callArgs.trim().isEmpty()) {
			var result = tryCompileParametricRecursion(funcDef, callArgs, instructions);
			if (result != null) {
				return result;
			}
		}

		// Fall back to pattern-based recursion (fn name() => { let n = read ... })
		var patternResult = parsePattern(body, funcName);
		if (patternResult instanceof Result.Err<ParsedPattern, CompileError> err) {
			return Result.err(err.error());
		}
		var pattern = ((Result.Ok<ParsedPattern, CompileError>) patternResult).value();
		return compileReadSumLoop(pattern, instructions);
	}

	private static Result<Void, CompileError> compileReadSumLoop(ParsedPattern pattern, List<Instruction> instructions) {
		// Check if this is a multi-read pattern by seeing if varName contains commas
		if (pattern.varName().contains(",")) {
			return compileMultiReadSumLoop(pattern, instructions);
		}
		return compileReadSumLoopSingleRead(pattern.baseValue(), pattern.op(), instructions);
	}

	private static Result<Void, CompileError> compileReadSumLoopSingleRead(long baseValue, String operator,
			List<Instruction> instructions) {
		// Iterative code for single-read pattern:
		// 1. reg[0] = BASE (accumulator, e.g., 0 for +, 1 for *)
		// 2. Loop start: reg[1] = read input
		// 3. Check if reg[1] <= 0, if so jump to end
		// 4. Accumulate: reg[0] += reg[1] (or *= or -= or /=, depending on operator)
		// 5. Jump back to loop start
		// 6. End: reg[0] has result

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, baseValue));

		var loopStart = instructions.size();
		instructions.add(new Instruction(Operation.In, Variant.Immediate, 1, 0L));

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 3, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 3, 1L));

		var jumpToEndIdx = emitLessThanOrEqualZeroCheck(1, instructions);

		// Emit the appropriate operator instruction
		var accumulateOp = mapOperatorToOperation(operator);
		instructions.add(new Instruction(accumulateOp, Variant.Immediate, 0, 3L));

		finishLoopWithBackjump(instructions, loopStart, jumpToEndIdx);
		return Result.ok(null);
	}

	private static Operation mapOperatorToOperation(String operator) {
		return switch (operator) {
			case "+" -> Operation.Add;
			case "-" -> Operation.Sub;
			case "*" -> Operation.Mul;
			case "/" -> Operation.Div;
			default -> throw new IllegalArgumentException("Unknown operator: " + operator);
		};
	}

	/**
	 * Compile multi-read recursion: fn sumPairs() => { let x = read I32; let y =
	 * read I32; if (x <= 0) 0 else x + y + sumPairs() }
	 * <p>
	 * Multi-read strategy uses all 4 registers efficiently:
	 * - reg[0] = accumulator (result)
	 * - reg[1] = first read value (used in accumulation, then destroyed in check)
	 * - reg[2] = second read value (used in accumulation, preserved)
	 * - reg[3] = temp for subtract during condition check
	 * <p>
	 * Order: read → accumulate → check condition
	 */
	private static Result<Void, CompileError> compileMultiReadSumLoop(ParsedPattern pattern,
			List<Instruction> instructions) {
		var readVars = pattern.varName().split(",");
		if (readVars.length != 2) {
			return Result.err(new CompileError("Currently only support 2-read recursion, got " + readVars.length));
		}
		if (!"+".equals(pattern.op())) {
			return Result
					.err(new CompileError("Multi-read recursion currently only supports + operator, got " + pattern.op()));
		}

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, pattern.baseValue()));

		var loopStart = instructions.size();
		// Read both values
		instructions.add(new Instruction(Operation.In, Variant.Immediate, 1, 0L));
		instructions.add(new Instruction(Operation.In, Variant.Immediate, 2, 0L));

		// Accumulate FIRST: reg[0] += reg[1] + reg[2]
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 2L));

		// Then check condition: if (reg[1] <= 0) exit; else loop back
		// Check: compute (reg[1] - 1) and jump if < 0 (meaning reg[1] <= 0)
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 3, 1L)); // reg[3] = 1
		instructions.add(new Instruction(Operation.Sub, Variant.Immediate, 1, 3L)); // reg[1] -= reg[3], so reg[1] = reg[1]
																																								// - 1

		var jumpToEndIdx = instructions.size();
		instructions.add(new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 1, 0L));

		// Jump back to loop start (secondOperand is jump target for Jump instruction)
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0L, (long) loopStart));

		// Update jump target to current position (end of loop)
		var jumpInstr = instructions.get(jumpToEndIdx);
		instructions.set(jumpToEndIdx,
				new Instruction(jumpInstr.operation(), jumpInstr.variant(), jumpInstr.firstOperand(),
						(long) instructions.size()));
		return Result.ok(null);
	}

	private record ParsedPattern(String varName, long baseValue, String op, String calleeName) {
	}

	/**
	 * Try to compile parametric recursion:
	 * fn sum(n : I32) => if (n <= 0) 0 else n + sum(n - 1)
	 * <p>
	 * Returns null if the body doesn't match the expected pattern.
	 */
	private static Result<Void, CompileError> tryCompileParametricRecursion(
			FunctionHandler.FunctionDef funcDef,
			String callArgs,
			List<Instruction> instructions) {

		if (funcDef.params().size() != 1) {
			return null; // Only support single parameter for now
		}

		var paramName = funcDef.params().get(0).name();
		var body = funcDef.body().trim();

		// Parse the parametric recursion pattern:
		// if (PARAM <= 0) BASE else PARAM OP funcName(PARAM UPDATE)
		// E.g.: if (n <= 0) 0 else n + sum(n - 1)
		var p = Pattern.compile(
				"if\\s*\\(\\s*" + Pattern.quote(paramName) + "\\s*<=\\s*0\\s*\\)\\s*"
						+ "(\\d+)\\s+else\\s+"
						+ Pattern.quote(paramName) + "\\s*([+\\-*/])\\s*"
						+ funcDef.name() + "\\s*\\(\\s*(" + Pattern.quote(paramName)
						+ "\\s*(?:[+\\-]\\s*\\d+|[*\\/]\\s*\\d+))\\s*\\)");

		var m = p.matcher(body);
		if (!m.find()) {
			return null; // Doesn't match parametric pattern
		}

		var baseValue = Long.parseLong(m.group(1));
		var op = m.group(2);
		var updateExpr = m.group(3).trim();

		// Parse the call argument to get initial value
		var initialValue = callArgs.trim();

		return compileParametricLoop(paramName, initialValue, baseValue, op, updateExpr, instructions);
	}

	/**
	 * Compile parametric recursion to a loop:
	 * For fn sum(n : I32) => if (n <= 0) 0 else n + sum(n - 1); sum(5)
	 * Generate: result=0; n=5; loop { if n<=0 break; result+=n; n=n-1 }
	 */
	private static Result<Void, CompileError> compileParametricLoop(
			String paramName,
			String initialValue,
			long baseValue,
			String op,
			String updateExpr,
			List<Instruction> instructions) {

		// reg[0] = accumulator (result)
		// reg[1] = parameter value
		// reg[2] = temp for comparison

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, baseValue));

		// For now, assume initialValue is a literal number like "5"
		try {
			var initialVal = Long.parseLong(initialValue);
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, initialVal));
		} catch (NumberFormatException e) {
			return Result
					.err(new CompileError("Parametric recursion argument must be a literal number, got: " + initialValue));
		}

		var loopStart = instructions.size();

		var jumpToEndIdx = emitLessThanOrEqualZeroCheck(1, instructions);

		// Accumulate: result OP= param
		var accOp = switch (op) {
			case "+" -> Operation.Add;
			case "-" -> Operation.Sub;
			case "*" -> Operation.Mul;
			case "/" -> Operation.Div;
			default -> throw new IllegalArgumentException("Unsupported operator: " + op);
		};
		instructions.add(new Instruction(accOp, Variant.Immediate, 0, 1L));

		// Update parameter: param = param UPDATE
		// For now, only support param - 1 or param + 1
		if (updateExpr.matches(Pattern.quote(paramName) + "\\s*-\\s*1")) {
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, 1L));
			instructions.add(new Instruction(Operation.Sub, Variant.Immediate, 1, 2L));
		} else if (updateExpr.matches(Pattern.quote(paramName) + "\\s*\\+\\s*1")) {
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, 1L));
			instructions.add(new Instruction(Operation.Add, Variant.Immediate, 1, 2L));
		} else {
			return Result.err(new CompileError("Unsupported parameter update: " + updateExpr));
		}

		finishLoopWithBackjump(instructions, loopStart, jumpToEndIdx);
		return Result.ok(null);
	}

	private static void finishLoopWithBackjump(List<Instruction> instructions, int loopStart, int jumpToEndIdx) {
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, (long) loopStart));

		var loopEnd = instructions.size();
		instructions.set(jumpToEndIdx, new Instruction(
				Operation.JumpIfLessThanZero, Variant.Immediate, 1, (long) loopEnd));
	}

	/**
	 * Emit the `<= 0` check for a register by computing (reg - 1) and checking if
	 * result < 0.
	 * This is semantically equivalent to `if (reg <= 0)`.
	 * Uses register 2 as temporary for the literal 1.
	 * Returns the index of the JumpIfLessThanZero instruction to be patched with
	 * the end label.
	 */
	private static int emitLessThanOrEqualZeroCheck(int regNum, List<Instruction> instructions) {
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, 1L));
		instructions.add(new Instruction(Operation.Sub, Variant.Immediate, regNum, 2L));
		var jumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, regNum, 0L));
		// Restore register: reg = (reg - 1) + 1 = reg
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, 1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, regNum, 2L));
		return jumpIdx;
	}

	private static Result<ParsedPattern, CompileError> parsePattern(String body, String funcName) {
		body = body.trim();
		if (body.startsWith("{")) {
			body = body.substring(1);
		}
		if (body.endsWith("}")) {
			body = body.substring(0, body.length() - 1);
		}
		body = body.trim();

		var parsed = parseReadSumPattern(body);
		if (parsed instanceof Result.Err<ParsedPattern, CompileError>) {
			return parsed;
		}
		var pattern = ((Result.Ok<ParsedPattern, CompileError>) parsed).value();
		if (!pattern.calleeName().equals(funcName)) {
			return Result.err(new CompileError("Function body doesn't match recursive pattern: " + body));
		}
		return Result.ok(pattern);
	}

	private static Result<ParsedPattern, CompileError> tryParseMutualReadSumCycle(
			String startFuncName,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		Set<String> visited = new HashSet<>();
		var current = startFuncName;
		ParsedPattern first = null;

		while (true) {
			if (!visited.add(current)) {
				return null;
			}
			var def = functionRegistry.get(current);
			if (def == null) {
				return null;
			}
			var parsed = parseReadSumPattern(stripOuterBraces(def.body().trim()));
			if (parsed instanceof Result.Err<ParsedPattern, CompileError>) {
				return null;
			}
			var pattern = ((Result.Ok<ParsedPattern, CompileError>) parsed).value();
			if (!"+".equals(pattern.op())) {
				return null;
			}
			if (first == null) {
				first = pattern;
			} else if (first.baseValue() != pattern.baseValue()) {
				return null;
			}

			var next = pattern.calleeName();
			if (next.equals(startFuncName)) {
				// Require a true cycle (length > 1)
				if (visited.size() < 2) {
					return null;
				}
				return Result.ok(first);
			}
			current = next;

			if (visited.size() > functionRegistry.size()) {
				return null;
			}
		}
	}

	private static String stripOuterBraces(String body) {
		var result = body.trim();
		if (result.startsWith("{")) {
			result = result.substring(1);
		}
		if (result.endsWith("}")) {
			result = result.substring(0, result.length() - 1);
		}
		return result.trim();
	}

	private static Result<ParsedPattern, CompileError> parseReadSumPattern(String body) {
		// Match: let VAR = read TYPE; ... if (VAR <= 0) BASE else EXPR + callee()
		// Where EXPR can reference multiple read variables
		// First, try the simpler single-read pattern
		var singleReadPattern = Pattern.compile(
				"let\\s+(\\w+)\\s*(?::\\s*\\w+)?\\s*=\\s*read\\s+\\w+\\s*;\\s*"
						+ "if\\s*\\(\\s*\\1\\s*<=\\s*0\\s*\\)\\s*(\\d+)\\s+else\\s+\\1\\s*([+\\-*/])\\s*"
						+ "(\\w+)\\s*\\(\\s*\\)");
		var m = singleReadPattern.matcher(body);
		if (m.find()) {
			return Result.ok(new ParsedPattern(m.group(1), Long.parseLong(m.group(2)), m.group(3), m.group(4)));
		}

		// Try multi-read pattern: let x = read I32; let y = read I32; if (x <= 0) 0
		// else x + y + funcName()
		var multiReadResult = tryParseMultiReadSumPattern(body);
		if (multiReadResult != null) {
			return multiReadResult;
		}

		return Result.err(new CompileError("Function body doesn't match recursive pattern: " + body));
	}

	private static Result<ParsedPattern, CompileError> tryParseMultiReadSumPattern(String body) {
		// Extract all let statements: let x = read I32; let y = read I32; ...
		var letPattern = Pattern.compile("let\\s+(\\w+)\\s*(?::\\s*\\w+)?\\s*=\\s*read\\s+\\w+\\s*;");
		var letMatcher = letPattern.matcher(body);

		List<String> readVars = new ArrayList<>();
		var lastEnd = 0;
		while (letMatcher.find()) {
			readVars.add(letMatcher.group(1));
			lastEnd = letMatcher.end();
		}

		if (readVars.size() < 2) {
			return null; // Not a multi-read pattern
		}

		var firstVar = readVars.get(0);
		var afterReads = body.substring(lastEnd).trim();

		// Match: if (FIRST_VAR <= 0) BASE else EXPR + funcName()
		// The EXPR should reference the read variables
		var ifPattern = Pattern.compile(
				"if\\s*\\(\\s*" + Pattern.quote(firstVar) + "\\s*<=\\s*0\\s*\\)\\s*(\\d+)\\s+else\\s+"
						+ "(.+?)\\s*([+\\-*/])\\s*(\\w+)\\s*\\(\\s*\\)");
		var ifMatcher = ifPattern.matcher(afterReads);

		if (!ifMatcher.find()) {
			return null;
		}

		var baseValueStr = ifMatcher.group(1);
		var operator = ifMatcher.group(3);
		var funcName = ifMatcher.group(4);

		try {
			var baseValue = Long.parseLong(baseValueStr);
			// For multi-read, we pack the variable names into the varName field
			var packedVars = String.join(",", readVars);
			return Result.ok(new ParsedPattern(packedVars, baseValue, operator, funcName));
		} catch (NumberFormatException e) {
			return null;
		}
	}
}
