package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaNameExpr(String name, SourceSpan span) implements JavaExpr {
}
