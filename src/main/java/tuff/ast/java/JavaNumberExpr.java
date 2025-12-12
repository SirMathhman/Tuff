package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaNumberExpr(String text, SourceSpan span) implements JavaExpr {
}
