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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compiles recursive functions by transforming them to iterative form.
 * 
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
		// Check if stmt is just "funcName()"
		Pattern callPattern = Pattern.compile("^(\\w+)\\s*\\(\\s*\\)$");
		Matcher m = callPattern.matcher(stmt);
		if (!m.matches()) {
			return null; // Not a simple function call
		}
		String funcName = m.group(1);
		FunctionHandler.FunctionDef funcDef = functionRegistry.get(funcName);
		if (funcDef == null) {
			return null; // Function not defined
		}
		// Check if the function is recursive
		if (!isRecursive(funcName, funcDef.body())) {
			// Try to detect a mutually-recursive cycle like: a() -> b() -> c() -> a()
			Result<ParsedPattern, CompileError> mutual = tryParseMutualReadSumCycle(funcName, functionRegistry);
			if (mutual == null) {
				return null; // Not recursive, use normal path
			}
			if (mutual instanceof Result.Err<ParsedPattern, CompileError> err) {
				return Result.err(err.error());
			}
			ParsedPattern pattern = ((Result.Ok<ParsedPattern, CompileError>) mutual).value();
			return compileReadSumLoop(pattern.baseValue(), instructions);
		}
		// Compile using recursive function compiler
		return compileRecursiveFunction(funcDef, instructions);
	}

	/**
	 * Compile a tail-additive recursive function to iterative form.
	 * 
	 * Pattern: fn name() =&gt; { let n = read TYPE; if (n &lt;= 0) 0 else n +
	 * name() }
	 * Becomes: result=0; loop { n=read; if n&lt;=0 break; result+=n }; return
	 * result
	 */
	public static Result<Void, CompileError> compileRecursiveFunction(
			FunctionHandler.FunctionDef funcDef,
			List<Instruction> instructions) {

		String funcName = funcDef.name();
		String body = funcDef.body().trim();

		// Parse the function body pattern
		Result<ParsedPattern, CompileError> patternResult = parsePattern(body, funcName);
		if (patternResult instanceof Result.Err<ParsedPattern, CompileError> err) {
			return Result.err(err.error());
		}
		ParsedPattern pattern = ((Result.Ok<ParsedPattern, CompileError>) patternResult).value();
		return compileReadSumLoop(pattern.baseValue(), instructions);
	}

	private static Result<Void, CompileError> compileReadSumLoop(long baseValue, List<Instruction> instructions) {
		// Iterative code:
		// 1. reg[0] = BASE (accumulator)
		// 2. Loop start:
		// 3. reg[1] = read input
		// 4. save n to reg[3]
		// 5. if reg[1] <= 0, jump to end
		// 6. reg[0] += reg[3]
		// 7. jump to loop start
		// 8. End: reg[0] has result

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, baseValue));

		int loopStart = instructions.size();
		instructions.add(new Instruction(Operation.In, Variant.Immediate, 1, 0L));

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 3, 0L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 3, 1L));

		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, 1L));
		instructions.add(new Instruction(Operation.LessThan, Variant.Immediate, 1, 2L));
		instructions.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 1, 0L));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, 1L));
		instructions.add(new Instruction(Operation.Sub, Variant.Immediate, 1, 2L));

		int jumpToEndIdx = instructions.size();
		instructions.add(new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 1, 0L));

		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 3L));
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, (long) loopStart));

		int loopEnd = instructions.size();
		instructions.set(jumpToEndIdx, new Instruction(
				Operation.JumpIfLessThanZero, Variant.Immediate, 1, (long) loopEnd));

		return Result.ok(null);
	}

	private record ParsedPattern(String varName, long baseValue, String op, String calleeName) {
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

		Result<ParsedPattern, CompileError> parsed = parseReadSumPattern(body);
		if (parsed instanceof Result.Err<ParsedPattern, CompileError>) {
			return parsed;
		}
		ParsedPattern pattern = ((Result.Ok<ParsedPattern, CompileError>) parsed).value();
		if (!pattern.calleeName().equals(funcName)) {
			return Result.err(new CompileError("Function body doesn't match recursive pattern: " + body));
		}
		return Result.ok(pattern);
	}

	private static Result<ParsedPattern, CompileError> tryParseMutualReadSumCycle(
			String startFuncName,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		Set<String> visited = new HashSet<>();
		String current = startFuncName;
		ParsedPattern first = null;

		while (true) {
			if (!visited.add(current)) {
				return null;
			}
			FunctionHandler.FunctionDef def = functionRegistry.get(current);
			if (def == null) {
				return null;
			}
			Result<ParsedPattern, CompileError> parsed = parseReadSumPattern(stripOuterBraces(def.body().trim()));
			if (parsed instanceof Result.Err<ParsedPattern, CompileError>) {
				return null;
			}
			ParsedPattern pattern = ((Result.Ok<ParsedPattern, CompileError>) parsed).value();
			if (!"+".equals(pattern.op())) {
				return null;
			}
			if (first == null) {
				first = pattern;
			} else if (first.baseValue() != pattern.baseValue()) {
				return null;
			}

			String next = pattern.calleeName();
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
		String result = body.trim();
		if (result.startsWith("{")) {
			result = result.substring(1);
		}
		if (result.endsWith("}")) {
			result = result.substring(0, result.length() - 1);
		}
		return result.trim();
	}

	private static Result<ParsedPattern, CompileError> parseReadSumPattern(String body) {
		// Match: let VAR = read TYPE; if (VAR <= 0) BASE else VAR + callee()
		Pattern p = Pattern.compile(
				"let\\s+(\\w+)\\s*(?::\\s*\\w+)?\\s*=\\s*read\\s+\\w+\\s*;\\s*"
						+ "if\\s*\\(\\s*\\1\\s*<=\\s*0\\s*\\)\\s*(\\d+)\\s+else\\s+\\1\\s*([+\\-*/])\\s*"
						+ "(\\w+)\\s*\\(\\s*\\)");
		Matcher m = p.matcher(body);
		if (!m.find()) {
			return Result.err(new CompileError("Function body doesn't match recursive pattern: " + body));
		}
		return Result.ok(new ParsedPattern(m.group(1), Long.parseLong(m.group(2)), m.group(3), m.group(4)));
	}
}
