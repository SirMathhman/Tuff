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
 * Handles .length field access on arrays and array pointers.
 * Extracts the total capacity (length) from array type annotations.
 */
public final class ArrayLengthFieldAccessHandler {
	private ArrayLengthFieldAccessHandler() {
	}

	public static Result<Void, CompileError> handleArrayLengthFieldAccess(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		BiFunction<List<String>, String, String> lengthExtractor = (parts, fieldName) -> {
			String lengthCountStr = parts.get(2).trim();
			try {
				Long.parseLong(lengthCountStr);
				return lengthCountStr;
			} catch (NumberFormatException e) {
				return null;
			}
		};

		ArrayFieldAccessBase.Context ctx = new ArrayFieldAccessBase.Context.Builder()
				.varName(varName)
				.decl(decl)
				.continuation(continuation)
				.instructions(instructions)
				.functionRegistry(functionRegistry)
				.fieldName("length")
				.extractor(lengthExtractor)
				.build();
		return ArrayFieldAccessBase.handleArrayFieldAccess(ctx);
	}
}
