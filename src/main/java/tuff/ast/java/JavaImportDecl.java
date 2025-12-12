package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaImportDecl(boolean isStatic, String qualifiedName, SourceSpan span) implements JavaNode {
}
