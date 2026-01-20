package io.github.sirmathhman.tuff;

/**
 * A simple immutable tuple that holds two values.
 *
 * @param <A> The type of the first value
 * @param <B> The type of the second value
 */
public record Tuple<A, B>(A first, B second) {
	/**
	 * Creates a new tuple with the given values.
	 *
	 * @param <A>    The type of the first value
	 * @param <B>    The type of the second value
	 * @param first  The first value
	 * @param second The second value
	 * @return A new Tuple
	 */
	public static <A, B> Tuple<A, B> of(A first, B second) {
		return new Tuple<>(first, second);
	}
}
