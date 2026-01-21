package io.github.sirmathhman.tuff.compiler.letbinding.fields;

import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.VariableDecl;
import io.github.sirmathhman.tuff.vm.Instruction;

/**
 * Handles .capacity field access on arrays and array pointers.
 * Extracts the total capacity from array type annotations.
 */
public final class ArrayCapacityFieldAccessHandler {
	private ArrayCapacityFieldAccessHandler() {
	}

	public static Result<Void, CompileError> handleArrayCapacityFieldAccess(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		BiFunction<List<String>, String, String> capacityExtractor = (parts, fieldName) -> {
			var capacityCountStr = parts.get(2).trim();
			try {
				Long.parseLong(capacityCountStr);
				return capacityCountStr;
			} catch (NumberFormatException e) {
				return null;
			}
		};

		var ctx = new ArrayFieldAccessBase.Context.Builder()
				.varName(varName)
				.decl(decl)
				.continuation(continuation)
				.instructions(instructions)
				.functionRegistry(functionRegistry)
				.fieldName("capacity")
				.extractor(capacityExtractor)
				.build();
		return ArrayFieldAccessBase.handleArrayFieldAccess(ctx);
	}
}
