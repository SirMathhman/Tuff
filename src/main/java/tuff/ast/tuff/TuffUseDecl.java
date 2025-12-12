package tuff.ast.tuff;

import tuff.ast.SourceSpan;

import java.util.List;

/**
 * Legacy import node kept for compatibility with older code.
 *
 * Prefer {@link TuffImportDecl}.
 */
@Deprecated
public record TuffUseDecl(List<String> namespace, List<String> names, SourceSpan span) {
}
