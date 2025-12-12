package tuff.ast.java;

import tuff.ast.SourceSpan;

import java.util.List;

public record JavaCompilationUnit(
		List<JavaImportDecl> imports,
		List<JavaTypeDecl> types,
		SourceSpan span) implements JavaNode {
}
