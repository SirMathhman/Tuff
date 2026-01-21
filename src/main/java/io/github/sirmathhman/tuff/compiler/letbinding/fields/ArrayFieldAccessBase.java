package io.github.sirmathhman.tuff.compiler.letbinding.fields;

import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

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
 * Base handler for array field access (.init and .length).
 * Extracts values from array type annotations [Type; InitCount; TotalCount].
 */
public final class ArrayFieldAccessBase {
	private ArrayFieldAccessBase() {
	}

	public static final class Context {
		public final String varName;
		public final VariableDecl decl;
		public final String continuation;
		public final List<Instruction> instructions;
		public final Map<String, FunctionHandler.FunctionDef> functionRegistry;
		public final String fieldName;
		public final BiFunction<List<String>, String, String> extractor;

		private Context(Builder builder) {
			this.varName = builder.varName;
			this.decl = builder.decl;
			this.continuation = builder.continuation;
			this.instructions = builder.instructions;
			this.functionRegistry = builder.functionRegistry;
			this.fieldName = builder.fieldName;
			this.extractor = builder.extractor;
		}

		public static final class Builder {
			private String varName;
			private VariableDecl decl;
			private String continuation;
			private List<Instruction> instructions;
			private Map<String, FunctionHandler.FunctionDef> functionRegistry;
			private String fieldName;
			private BiFunction<List<String>, String, String> extractor;

			public Builder varName(String varName) {
				this.varName = varName;
				return this;
			}

			public Builder decl(VariableDecl decl) {
				this.decl = decl;
				return this;
			}

			public Builder continuation(String continuation) {
				this.continuation = continuation;
				return this;
			}

			public Builder instructions(List<Instruction> instructions) {
				this.instructions = instructions;
				return this;
			}

			public Builder functionRegistry(Map<String, FunctionHandler.FunctionDef> functionRegistry) {
				this.functionRegistry = functionRegistry;
				return this;
			}

			public Builder fieldName(String fieldName) {
				this.fieldName = fieldName;
				return this;
			}

			public Builder extractor(BiFunction<List<String>, String, String> extractor) {
				this.extractor = extractor;
				return this;
			}

			public Context build() {
				return new Context(this);
			}
		}
	}

	/**
	 * Generic handler for array field access. Takes a function that determines
	 * which part of the array type to extract (init=1, length=2).
	 */
	public static Result<Void, CompileError> handleArrayFieldAccess(Context ctx) {
		var declaredType = ctx.decl.declaredType();

		// If no explicit type, try to infer from value expression
		if (declaredType == null) {
			var valueExpr = ctx.decl.valueExpr().trim();
			if (valueExpr.startsWith("&")) {
				// It's a reference - extract the referenced variable
				var refName = valueExpr.substring(1).trim();
				if (refName.startsWith("mut ")) {
					refName = refName.substring(4).trim();
				}
				// Look up the type of the referenced variable
				var knownTypes = LetBindingProcessor.getVariableTypes();
				var refType = knownTypes.get(refName);
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

		// Handle both direct array types [Type; InitCount; TotalCount] and pointer
		// types
		var arrayTypeStr = declaredType;
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
		var inner = arrayTypeStr.substring(1, arrayTypeStr.length() - 1).trim();
		var parts = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ';');
		if (parts.size() != 3) {
			return null;
		}

		// Extract the value using the provided function
		var fieldValue = ctx.extractor.apply(parts, ctx.fieldName);
		if (fieldValue == null) {
			return Result.err(new CompileError("Invalid array " + ctx.fieldName + ": could not extract"));
		}

		// Track this variable's type for future references
		LetBindingProcessor.getVariableTypes().put(ctx.varName, declaredType);

		// Replace all occurrences of varName.fieldName with the field value
		var result = ctx.continuation.replaceAll(
				"\\b" + java.util.regex.Pattern.quote(ctx.varName) + "\\." + ctx.fieldName + "\\b",
				fieldValue);

		// Parse the substituted continuation
		var contResult = App.parseExpressionWithRead(result,
																								 ctx.functionRegistry);
		return contResult.match(expr -> App.generateInstructions(expr, ctx.instructions), Result::err);
	}
}
