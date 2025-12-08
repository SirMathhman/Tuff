package tuff;

import java.util.List;

final class FunctionDef {
	static final class Signature {
		final List<String> paramNames;
		final List<DeclaredType> paramTypes;

		Signature(List<String> paramNames, List<DeclaredType> paramTypes) {
			this.paramNames = paramNames;
			this.paramTypes = paramTypes;
		}
	}

	final List<String> typeParams; // generic type parameter names, may be empty
	final Signature signature;
	final FunctionBody body; // encapsulates return type + body source

	FunctionDef(List<String> typeParams, Signature signature, FunctionBody body) {
		this.typeParams = typeParams;
		this.signature = signature;
		this.body = body;
	}
}
