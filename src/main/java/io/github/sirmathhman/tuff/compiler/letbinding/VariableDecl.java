package io.github.sirmathhman.tuff.compiler.letbinding;

public record VariableDecl(String varName, boolean isMutable, String valueExpr) {
}
