package io.github.sirmathhman.tuff.compiler.letbinding.fields;

import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.StructDefinition;
import io.github.sirmathhman.tuff.compiler.letbinding.VariableDecl;
import io.github.sirmathhman.tuff.vm.Instruction;

/**
 * Handles array field access (.init and .length) for let bindings.
 */
public final class ArrayFieldAccessProcessor {
	private ArrayFieldAccessProcessor() {
	}

	public static Result<Void, CompileError> handleArrayFieldAccess(String varName, VariableDecl decl,
			String continuation, ArrayList<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry, Map<String, StructDefinition> structRegistry) {
		// Try .init field access
		if (continuation.contains(varName + ".init")) {
			var result = tryHandleArrayField(varName, decl, continuation, instructions,
																			 functionRegistry, "init");
			if (result != null) {
				return result;
			}
		}

		// Try .capacity field access
		if (continuation.contains(varName + ".capacity")) {
			var result = tryHandleArrayField(varName, decl, continuation, instructions,
																			 functionRegistry, "capacity");
			return result;
		}

		return null;
	}

	private static Result<Void, CompileError> tryHandleArrayField(String varName, VariableDecl decl,
			String continuation, ArrayList<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry, String fieldName) {
		// Check if declaredType is an array type or inferred from reference
		var isExplicitArrayType = decl.declaredType() != null && decl.declaredType().startsWith("[");
		var couldBeInferredArrayPointer = decl.declaredType() == null && decl.valueExpr().trim().startsWith("&");

		if (!isExplicitArrayType && !couldBeInferredArrayPointer) {
			return null;
		}

		// Dispatch to appropriate handler based on field name
		if ("init".equals(fieldName)) {
			return ArrayInitFieldAccessHandler.handleArrayInitFieldAccess(varName, decl, continuation, instructions,
					functionRegistry);
		} else if ("capacity".equals(fieldName)) {
			return ArrayCapacityFieldAccessHandler.handleArrayCapacityFieldAccess(varName, decl, continuation,
					instructions, functionRegistry);
		}
		return null;
	}
}
