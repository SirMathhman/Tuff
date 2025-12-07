package tuff;

import java.util.List;

final class FunctionDef {
	final List<String> paramNames;
	final List<DeclaredType> paramTypes; // may contain null entries if not declared
	final FunctionBody body; // encapsulates return type + body source

	FunctionDef(List<String> paramNames, List<DeclaredType> paramTypes, FunctionBody body) {
		this.paramNames = paramNames;
		this.paramTypes = paramTypes;
		this.body = body;
	}
}
