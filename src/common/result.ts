interface Ok<T> {
	type: 'ok';
	value: T;
}

interface Err {
	type: 'err';
	error: string;
}

/**
 * Represents the result of an operation, either success with a value or failure with an error.
 */
export type Result<T> = Ok<T> | Err;

/**
 * Creates a successful result containing a value.
 * @param value - The value to wrap in a successful result
 * @returns A Result with type 'ok' containing the value
 */
export function ok<T>(value: T): Result<T> {
	return { type: 'ok', value };
}

/**
 * Creates a failed result with an error message.
 * @param error - The error message
 * @returns A Result with type 'err' containing the error message
 */
export function err<T>(error: string): Result<T> {
	return { type: 'err', error };
}
