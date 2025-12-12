package tuff.ast.tuff;

import tuff.ast.SourceSpan;

import java.util.List;

public record TuffUseDecl(List<String> namespace, List<String> names, SourceSpan span) implements TuffNode {
}
