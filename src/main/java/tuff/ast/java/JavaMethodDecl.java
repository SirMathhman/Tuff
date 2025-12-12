package tuff.ast.java;

import tuff.ast.SourceSpan;

import java.util.List;

public record JavaMethodDecl(JavaTypeRef returnType, String name, List<JavaParam> params, JavaBlock body,
		SourceSpan span)
		implements JavaMemberDecl {
}
