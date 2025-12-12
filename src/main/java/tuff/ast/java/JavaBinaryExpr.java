package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaBinaryExpr(JavaExpr left, String op, JavaExpr right, SourceSpan span) implements JavaExpr {
}
