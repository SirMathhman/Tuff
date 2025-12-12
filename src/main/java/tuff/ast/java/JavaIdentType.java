package tuff.ast.java;

import tuff.ast.SourceSpan;

public record JavaIdentType(String name, SourceSpan span) implements JavaTypeRef {
}
