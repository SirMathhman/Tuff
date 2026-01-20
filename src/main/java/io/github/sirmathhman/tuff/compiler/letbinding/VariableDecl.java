package io.github.sirmathhman.tuff.compiler.letbinding;

public record VariableDecl(String varName, boolean isMutable, String valueExpr, String declaredType) {
	public VariableDecl(String varName, boolean isMutable, String valueExpr) {
		this(varName, isMutable, valueExpr, null);
	}
}
