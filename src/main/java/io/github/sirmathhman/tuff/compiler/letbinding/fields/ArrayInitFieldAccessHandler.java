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
 * Handles .init field access on arrays and array pointers.
 * Extracts the initialized count from array type annotations.
 */
public final class ArrayInitFieldAccessHandler {
	private ArrayInitFieldAccessHandler() {
	}

	public static Result<Void, CompileError> handleArrayInitFieldAccess(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		BiFunction<List<String>, String, String> initExtractor = (parts, fieldName) -> {
			var initCountStr = parts.get(1).trim();
			try {
				Long.parseLong(initCountStr);
				return initCountStr;
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
				.fieldName("init")
				.extractor(initExtractor)
				.build();
		return ArrayFieldAccessBase.handleArrayFieldAccess(ctx);
	}
}
