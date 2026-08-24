package tuff.tuffc.error;

/**
 * A structured error carrying what the error is ({@link #kind()}), where it
 * occurred ({@link #location()}), and why it is an error with how to fix it
 * ({@link #message()}).
 */
public final class Diagnostic {

	private final ErrorKind kind;
	private final String location;
	private final String message;

	/**
	 * Creates a diagnostic.
	 *
	 * @param kind     what the error is
	 * @param location the offending source text (empty when there is none)
	 * @param message  why it is an error and how to fix it
	 */
	public Diagnostic(ErrorKind kind, String location, String message) {
		this.kind = kind;
		this.location = location;
		this.message = message;
	}

	/**
	 * @return what the error is
	 */
	public ErrorKind kind() {
		return kind;
	}

	/**
	 * @return the offending source text (empty when there is none)
	 */
	public String location() {
		return location;
	}

	/**
	 * @return why it is an error and how to fix it
	 */
	public String message() {
		return message;
	}

	@Override
	public String toString() {
		return kind + ": " + message + (location.isEmpty() ? "" : " (at: " + location + ")");
	}
}
