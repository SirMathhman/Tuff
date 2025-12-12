package tuff.ast.tuff;

import tuff.ast.SourceSpan;

import java.util.List;

/**
 * Represents either:
 * - from a::b::C use { x, y };
 * - from a::b::C;
 */
public record TuffImportDecl(List<String> modulePath, List<String> names, SourceSpan span) implements TuffNode {
	public boolean isDefaultImport() {
		return names == null || names.isEmpty();
	}
}
