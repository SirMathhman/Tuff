package tuff.tuffc.error;

/**
 * The project's error-handling primitive. A fallible operation returns a
 * {@code Result} holding either a success value or a structured
 * {@link Diagnostic}, never a thrown exception.
 *
 * @param <T> the success value type
 */
public final class Result<T> {

	private final T value;
	private final Diagnostic error;

	private Result(T value, Diagnostic error) {
		this.value = value;
		this.error = error;
	}

	/**
	 * Creates a successful result.
	 *
	 * @param value the success value
	 * @param <T>   the success value type
	 * @return a successful result
	 */
	public static <T> Result<T> ok(T value) {
		return new Result<>(value, null);
	}

	/**
	 * Creates a failed result.
	 *
	 * @param error the structured error
	 * @param <T>   the success value type
	 * @return a failed result
	 */
	public static <T> Result<T> fail(Diagnostic error) {
		return new Result<>(null, error);
	}

	/**
	 * @return {@code true} if this result holds a success value
	 */
	public boolean isOk() {
		return error == null;
	}

	/**
	 * @return {@code true} if this result holds a diagnostic
	 */
	public boolean isFail() {
		return error != null;
	}

	/**
	 * Returns the success value.
	 *
	 * @return the success value
	 * @throws IllegalStateException if this result is a failure
	 */
	public T value() {
		if (error != null) {
			throw new IllegalStateException("Result is a failure; no value present: " + error);
		}
		return value;
	}

	/**
	 * Returns the diagnostic.
	 *
	 * @return the diagnostic, or {@code null} if this result is a success
	 */
	public Diagnostic error() {
		return error;
	}
}
