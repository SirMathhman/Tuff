package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaReturnStmt(JavaExpr value, SourceSpan span) implements JavaStmt {
}
