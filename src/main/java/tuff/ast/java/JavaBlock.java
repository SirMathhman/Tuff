package tuff.ast.java;

import tuff.ast.SourceSpan;

import java.util.List;

public record JavaBlock(List<JavaStmt> stmts, SourceSpan span) implements JavaNode {
}
