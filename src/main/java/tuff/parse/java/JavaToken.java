package tuff.parse.java;

import tuff.ast.SourceSpan;

public record JavaToken(JavaTokenType type, String lexeme, SourceSpan span) {
}
