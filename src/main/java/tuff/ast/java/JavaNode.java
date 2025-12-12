package tuff.ast.java;

import tuff.ast.SourceSpan;

public sealed interface JavaNode permits JavaCompilationUnit, JavaImportDecl, JavaTypeDecl, JavaMemberDecl, JavaParam,
		JavaBlock, JavaStmt, JavaExpr, JavaTypeRef {
	SourceSpan span();
}
