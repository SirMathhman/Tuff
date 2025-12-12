package tuff.ast.tuff;

import tuff.ast.SourceSpan;

public record TuffRawDecl(String text, SourceSpan span) implements TuffDecl {
}
