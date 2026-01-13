package com.example;

import java.util.Optional;
import java.util.function.Function;

/**
 * A simple Result type that represents either a success (Ok) or a failure
 * (Err).
 *
 * @param <T> The type of the success value.
 * @param <X> The type of the failure value.
 */
public final class Result<T, X> {
	private final Optional<T> value;
	private final Optional<X> error;

	private Result(Optional<T> value, Optional<X> error) {
		this.value = value;
		this.error = error;
	}

	public static <T, X> Result<T, X> ok(T value) {
		return new Result<>(Optional.of(value), Optional.empty());
	}

	public static <T, X> Result<T, X> err(X error) {
		return new Result<>(Optional.empty(), Optional.of(error));
	}

	public boolean isOk() {
		return value.isPresent();
	}

	public boolean isErr() {
		return error.isPresent();
	}

	public T get() {
		return value.get();
	}

	public X getError() {
		return error.get();
	}

	public <U> Result<U, X> map(Function<T, U> mapper) {
		if (isOk()) {
			return Result.ok(mapper.apply(value.get()));
		}
		return Result.err(error.get());
	}

	public T orElse(T defaultValue) {
		return value.orElse(defaultValue);
	}
}
