package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaParam(JavaTypeRef type, String name, SourceSpan span) implements JavaNode {
}
