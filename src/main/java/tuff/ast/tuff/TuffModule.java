package tuff.ast.tuff;

import tuff.ast.SourceSpan;

import java.util.List;

public record TuffModule(List<TuffImportDecl> imports, List<TuffDecl> decls, SourceSpan span) implements TuffNode {
}
