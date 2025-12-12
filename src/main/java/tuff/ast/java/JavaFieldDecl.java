package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaFieldDecl(JavaTypeRef type, String name, JavaExpr init, SourceSpan span) implements JavaMemberDecl {
}
