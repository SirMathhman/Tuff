package io.github.sirmathhman.tuff.compiler.letbinding.fields;

import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;
import java.util.function.BiFunction;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
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
		public final ArrayList<Instruction> instructions;
		public final Map<String, FunctionHandler.FunctionDef> functionRegistry;
		public final String fieldName;
		public final BiFunction<ArrayList<String>, String, String> extractor;

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
			private ArrayList<Instruction> instructions;
			private Map<String, FunctionHandler.FunctionDef> functionRegistry;
			private String fieldName;
			private BiFunction<ArrayList<String>, String, String> extractor;

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

			public Builder instructions(ArrayList<Instruction> instructions) {
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

			public Builder extractor(BiFunction<ArrayList<String>, String, String> extractor) {
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
		var c = ctx;
		var declaredType = resolveDeclaredType(c.decl);
		if (declaredType == null) {
			return null;
		}

		var arrayTypeStr = extractArrayTypeString(declaredType);
		if (arrayTypeStr == null) {
			return null;
		}

		var parts = parseArrayTypeParts(arrayTypeStr);
		if (parts == null) {
			return null;
		}

		var fieldValue = c.extractor.apply(parts, c.fieldName);
		if (fieldValue == null) {
			return Result.err(new CompileError("Invalid array " + c.fieldName + ": could not extract"));
		}

		LetBindingProcessor.getVariableTypes().put(c.varName, declaredType);

		var result = c.continuation.replaceAll(
				"\\b" + java.util.regex.Pattern.quote(c.varName) + "\\." + c.fieldName + "\\b",
				fieldValue);

		var contResult = App.parseExpressionWithRead(result, c.functionRegistry);
		return contResult.match(
				expr -> App.generateInstructions(expr, ctx.instructions).map(ignored -> (Void) null),
				Result::err);
	}

	private static String resolveDeclaredType(VariableDecl decl) {
		var declaredType = decl.declaredType();
		if (declaredType != null) {
			return declaredType;
		}
		var valueExpr = decl.valueExpr().trim();
		if (!valueExpr.startsWith("&")) {
			return null;
		}
		var refName = valueExpr.substring(1).trim();
		if (refName.startsWith("mut ")) {
			refName = refName.substring(4).trim();
		}
		var knownTypes = LetBindingProcessor.getVariableTypes();
		var refType = knownTypes.get(refName);
		return refType != null ? "*" + refType : null;
	}

	private static String extractArrayTypeString(String declaredType) {
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
		return arrayTypeStr;
	}

	private static ArrayList<String> parseArrayTypeParts(String arrayTypeStr) {
		var inner = arrayTypeStr.substring(1, arrayTypeStr.length() - 1).trim();
		var parts = DepthAwareSplitter.splitByDelimiterAtDepthZero(inner, ';');
		return parts.size() == 3 ? parts : null;
	}
}
