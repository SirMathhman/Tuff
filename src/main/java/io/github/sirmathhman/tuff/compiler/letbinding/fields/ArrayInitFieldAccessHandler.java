package io.github.sirmathhman.tuff.compiler.letbinding.fields;

import java.util.List;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.LetBindingProcessor;
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
		String declaredType = decl.declaredType();

		// If no explicit type, try to infer from value expression
		if (declaredType == null) {
			String valueExpr = decl.valueExpr().trim();
			if (valueExpr.startsWith("&")) {
				// It's a reference - extract the referenced variable
				String refName = valueExpr.substring(1).trim();
				if (refName.startsWith("mut ")) {
					refName = refName.substring(4).trim();
				}
				// Look up the type of the referenced variable
				Map<String, String> knownTypes = LetBindingProcessor.getVariableTypes();
				String refType = knownTypes.get(refName);
				if (refType != null) {
					// Reference type is *<original type>
					declaredType = "*" + refType;
				} else {
					return null;
				}
			} else {
				return null;
			}
		}

		// Handle both direct array types [Type; InitCount; TotalCount] and pointer types
		// *[Type; InitCount; TotalCount]
		String arrayTypeStr = declaredType;
		if (declaredType.startsWith("*")) {
			arrayTypeStr = declaredType.substring(1).trim();
			if (arrayTypeStr.startsWith("mut ")) {
				arrayTypeStr = arrayTypeStr.substring(4).trim();
			}
		}

		if (!arrayTypeStr.startsWith("[") || !arrayTypeStr.endsWith("]")) {
			return null;
		}

		// Extract the array type format: [Type; InitCount; TotalCount]
		String inner = arrayTypeStr.substring(1, arrayTypeStr.length() - 1).trim();
		List<String> parts = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ';');
		if (parts.size() != 3) {
			return null;
		}

		String initCountStr = parts.get(1).trim();
		long initCount;
		try {
			initCount = Long.parseLong(initCountStr);
		} catch (NumberFormatException e) {
			return Result.err(new CompileError("Invalid array init count: " + initCountStr));
		}

		// Track this variable's type for future references
		LetBindingProcessor.getVariableTypes().put(varName, declaredType);

		// Replace all occurrences of varName.init with the init count
		String result = continuation.replaceAll("\\b" + java.util.regex.Pattern.quote(varName) + "\\.init\\b",
				String.valueOf(initCount));

		// Parse the substituted continuation
		Result<ExpressionModel.ExpressionResult, CompileError> contResult = App.parseExpressionWithRead(result,
				functionRegistry);
		return contResult.match(expr -> App.generateInstructions(expr, instructions), Result::err);
	}
}
