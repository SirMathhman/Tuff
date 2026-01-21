package io.github.sirmathhman.tuff.compiler.functions;

import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class ArrayPointerIndexingHandler {
	private ArrayPointerIndexingHandler() {
	}

	public static Result<Void, CompileError> handleMemoryArrayPointerIndexing(String varName, String arrayVarName,
																																						String continuation, ArrayList<Instruction> instructions, Map<String, Integer> variableAddresses,
																																						Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Handle case where we're indexing an array that's stored in memory via a
		// pointer
		// e.g., let array = [...]; let ref : *[I32] = &array; ref[0] + ref[1]

		int arrayMemAddr = variableAddresses.get(arrayVarName);

		// Generate load instructions for all indexed accesses
		var indexPattern = java.util.regex.Pattern
				.compile("\\b" + java.util.regex.Pattern.quote(varName) + "\\[(\\d+)\\]");
		var matcher = indexPattern.matcher(continuation);

		java.util.Map<Integer, Integer> indexToReg = new java.util.LinkedHashMap<>();
		var nextReg = 0;
		while (matcher.find()) {
			var index = Integer.parseInt(matcher.group(1));
			if (!indexToReg.containsKey(index) && nextReg < 4) {
				instructions.add(new Instruction(
						Operation.Load,
						Variant.DirectAddress,
						nextReg,
						(long) (arrayMemAddr + index)));
				indexToReg.put(index, nextReg);
				nextReg++;
			}
		}

		// Replace indexed references with register placeholders
		var substitutedCont = continuation.trim();
		for (var entry : indexToReg.entrySet()) {
			int index = entry.getKey();
			int reg = entry.getValue();
			var pattern = "\\b" + java.util.regex.Pattern.quote(varName) + "\\[" + index + "\\]";
			substitutedCont = substitutedCont.replaceAll(pattern, "__REG_" + reg + "__");
		}

		// Try to handle as pure addition expression
		if (substitutedCont.matches("(__REG_\\d+__)(\\s*\\+\\s*__REG_\\d+__)*")) {
			return generateAdditionInstructions(substitutedCont, instructions);
		}

		// Fall back to parsing for non-pure-addition expressions
		var contResult = App
				.parseExpressionWithRead(substitutedCont, functionRegistry);
		return contResult.match(expr -> App.generateInstructions(expr, instructions),
				Result::err);
	}

	private static Result<Void, CompileError> generateAdditionInstructions(String substitutedCont,
			ArrayList<Instruction> instructions) {
		var regRefPattern = java.util.regex.Pattern.compile("__REG_(\\d+)__");
		var regMatcher = regRefPattern.matcher(substitutedCont);

		var resultReg = 0;
		var first = true;
		while (regMatcher.find()) {
			var srcReg = Integer.parseInt(regMatcher.group(1));
			if (first) {
				if (srcReg != resultReg) {
					// Zero out reg 0 and add srcReg: reg0 = 0 + srcReg
					instructions.add(new Instruction(
							Operation.Load,
							Variant.Immediate,
							0L,
							0L));
					instructions.add(new Instruction(
							Operation.Add,
							Variant.Immediate,
							(long) resultReg,
							(long) srcReg));
				}
				first = false;
			} else {
				// Add srcReg to resultReg
				instructions.add(new Instruction(
						Operation.Add,
						Variant.Immediate,
						(long) resultReg,
						(long) srcReg));
			}
		}
		return Result.ok(null);
	}
}
