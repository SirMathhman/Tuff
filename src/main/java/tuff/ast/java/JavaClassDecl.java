package tuff.ast.java;

import tuff.ast.SourceSpan;

import java.util.List;

public record JavaClassDecl(String name, List<JavaMemberDecl> members, SourceSpan span) implements JavaTypeDecl {
}
