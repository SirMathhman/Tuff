package io.github.sirmathhman.tuff;

/**
 * A generic Result type that represents either a success (Ok) or a failure
 * (Err).
 *
 * @param <T> The type of the success value
 * @param <X> The type of the error value
 */
public sealed interface Result<T, X> {
	/**
	 * Creates a Result containing a success value.
	 *
	 * @param <T>   The type of the success value
	 * @param <X>   The type of the error value
	 * @param value The success value
	 * @return A Result containing the success value
	 */
	static <T, X> Result<T, X> ok(T value) {
		return new Ok<>(value);
	}

	/**
	 * Creates a Result containing an error value.
	 *
	 * @param <T>   The type of the success value
	 * @param <X>   The type of the error value
	 * @param error The error value
	 * @return A Result containing the error value
	 */
	static <T, X> Result<T, X> err(X error) {
		return new Err<>(error);
	}

	/**
	 * Applies a function to the success value if present.
	 *
	 * @param <U> The return type of the mapping function
	 * @param f   The function to apply
	 * @return A new Result with the mapped value, or the error
	 */
	<U> Result<U, X> map(Function<T, U> f);

	/**
	 * Applies a function to the error value if present.
	 *
	 * @param <Y> The return type of the mapping function
	 * @param f   The function to apply
	 * @return A new Result with the mapped error, or the success value
	 */
	<Y> Result<T, Y> mapErr(Function<X, Y> f);

	/**
	 * Applies a function that returns a Result to the success value if present.
	 * If this Result is an error, the error is propagated.
	 *
	 * @param <U> The type of the success value in the returned Result
	 * @param f   The function to apply
	 * @return A new Result from applying f to the success value, or the error
	 */
	<U> Result<U, X> flatMap(Function<T, Result<U, X>> f);

	/**
	 * Combines this Result with another Result using a Supplier.
	 * If this Result is Ok and the other is Ok, returns Ok containing a Tuple of
	 * both values.
	 * If either Result is an error, returns the error (preferring this Result's
	 * error if both are errors).
	 *
	 * @param <U>   The type of the success value in the other Result
	 * @param other The supplier that provides the other Result
	 * @return A Result containing a Tuple of both success values, or an error
	 */
	<U> Result<Tuple<T, U>, X> and(Supplier<Result<U, X>> other);

	/**
	 * Matches on this Result and applies the appropriate function.
	 * If this is Ok, applies the ok function to the success value.
	 * If this is Err, applies the err function to the error value.
	 *
	 * @param <R>   The return type of both functions
	 * @param okFn  The function to apply if this is Ok
	 * @param errFn The function to apply if this is Err
	 * @return The result of applying the appropriate function
	 */
	<R> R match(Function<T, R> okFn, Function<X, R> errFn);

	/**
	 * Consumes this Result by applying the appropriate function.
	 * If this is Ok, applies the ok consumer to the success value.
	 * If this is Err, applies the err consumer to the error value.
	 *
	 * @param okFn  The function to apply if this is Ok
	 * @param errFn The function to apply if this is Err
	 */
	void consume(Function<T, Void> okFn, Function<X, Void> errFn);

	/**
	 * Success variant of Result.
	 */
	record Ok<T, X>(T value) implements Result<T, X> {
		@Override
		public <U> Result<U, X> map(Function<T, U> f) {
			return Result.ok(f.apply(value));
		}

		@Override
		public <Y> Result<T, Y> mapErr(Function<X, Y> f) {
			return Result.ok(value);
		}

		@Override
		public <U> Result<U, X> flatMap(Function<T, Result<U, X>> f) {
			return f.apply(value);
		}

		@Override
		public <U> Result<Tuple<T, U>, X> and(Supplier<Result<U, X>> other) {
			Result<U, X> otherResult = other.get();
			return otherResult.match(
					otherValue -> Result.ok(new Tuple<>(value, otherValue)),
					Result::err);
		}

		@Override
		public <R> R match(Function<T, R> okFn, Function<X, R> errFn) {
			return okFn.apply(value);
		}

		@Override
		public void consume(Function<T, Void> okFn, Function<X, Void> errFn) {
			okFn.apply(value);
		}
	}

	/**
	 * Error variant of Result.
	 */
	record Err<T, X>(X error) implements Result<T, X> {
		@Override
		public <U> Result<U, X> map(Function<T, U> f) {
			return Result.err(error);
		}

		@Override
		public <Y> Result<T, Y> mapErr(Function<X, Y> f) {
			return Result.err(f.apply(error));
		}

		@Override
		public <U> Result<U, X> flatMap(Function<T, Result<U, X>> f) {
			return Result.err(error);
		}

		@Override
		public <U> Result<Tuple<T, U>, X> and(Supplier<Result<U, X>> other) {
			return Result.err(error);
		}

		@Override
		public <R> R match(Function<T, R> okFn, Function<X, R> errFn) {
			return errFn.apply(error);
		}

		@Override
		public void consume(Function<T, Void> okFn, Function<X, Void> errFn) {
			errFn.apply(error);
		}
	}

	/**
	 * Functional interface for mapping operations.
	 */
	@FunctionalInterface
	interface Function<A, B> {
		B apply(A a);
	}

	/**
	 * Functional interface for providing values.
	 */
	@FunctionalInterface
	interface Supplier<A> {
		A get();
	}
}
