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
	 * Gets the success value, or null if this is an error.
	 * 
	 * @return The success value or null
	 */
	T okValue();

	/**
	 * Gets the error value, or null if this is a success.
	 * 
	 * @return The error value or null
	 */
	X errValue();

	/**
	 * Checks if this Result is a success.
	 * 
	 * @return true if this is a success, false otherwise
	 */
	boolean isOk();

	/**
	 * Checks if this Result is an error.
	 * 
	 * @return true if this is an error, false otherwise
	 */
	boolean isErr();

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
		public T okValue() {
			return value;
		}

		@Override
		public X errValue() {
			return null;
		}

		@Override
		public boolean isOk() {
			return true;
		}

		@Override
		public boolean isErr() {
			return false;
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
		public T okValue() {
			return null;
		}

		@Override
		public X errValue() {
			return error;
		}

		@Override
		public boolean isOk() {
			return false;
		}

		@Override
		public boolean isErr() {
			return true;
		}
	}

	/**
	 * Functional interface for mapping operations.
	 */
	@FunctionalInterface
	interface Function<A, B> {
		B apply(A a);
	}
}
