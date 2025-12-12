package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaImportDecl(String qualifiedName, SourceSpan span) implements JavaNode {
}
