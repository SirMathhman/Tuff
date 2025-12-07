package tuff;

import java.util.List;

final class FunctionDef {
	final List<String> paramNames;
	final List<DeclaredType> paramTypes; // may contain null entries if not declared
	final DeclaredType returnType; // may be null
	final String bodySource; // body text including braces

	FunctionDef(List<String> paramNames, List<DeclaredType> paramTypes, DeclaredType returnType, String bodySource) {
		this.paramNames = paramNames;
		this.paramTypes = paramTypes;
		this.returnType = returnType;
		this.bodySource = bodySource;
	}
}
