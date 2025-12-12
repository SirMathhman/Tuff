package tuff.ast.tuff;

import tuff.ast.SourceSpan;

public sealed interface TuffNode permits TuffModule, TuffImportDecl, TuffDecl {
	SourceSpan span();
}
