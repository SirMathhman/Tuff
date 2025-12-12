package tuff.ast.tuff;

import tuff.ast.SourceSpan;

public sealed interface TuffNode permits TuffModule, TuffUseDecl, TuffDecl {
	SourceSpan span();
}
