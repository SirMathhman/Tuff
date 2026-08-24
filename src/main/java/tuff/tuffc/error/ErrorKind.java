package tuff.tuffc.error;

/**
 * The kinds of errors the evaluator can produce.
 */
public enum ErrorKind {

	/** The program is empty or null. */
	EMPTY_PROGRAM,

	/** A {@code let} statement is missing its {@code =}. */
	INVALID_LET_STATEMENT,

	/** A value that should be an integer literal is not. */
	INVALID_INTEGER,

	/** A {@code return} references a variable that was never declared. */
	UNDEFINED_VARIABLE,

	/** A statement that is neither {@code let} nor {@code return}. */
	UNSUPPORTED_STATEMENT
}
