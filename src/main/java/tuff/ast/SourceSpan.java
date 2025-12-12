package tuff.ast;

/**
 * Source span for diagnostics.
 *
 * Offsets are 0-based character indices into the original source text.
 */
public record SourceSpan(int startOffset, int endOffset) {
	public static final SourceSpan NONE = new SourceSpan(-1, -1);
}
