export interface Success<T> {
	success: true;
	value: T;
}

export interface Failure<X> {
	success: false;
	error: X;
}

export type Result<T, X> = Success<T> | Failure<X>;

/**
 * Creates a successful result.
 * @param value The value to wrap.
 * @returns A success result.
 */
export function success<T, X>(value: T): Result<T, X> {
	return { success: true, value };
}

/**
 * Creates a failed result.
 * @param error The error to wrap.
 * @returns A failure result.
 */
export function failure<T, X>(error: X): Result<T, X> {
	return { success: false, error };
}
