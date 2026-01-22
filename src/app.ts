import { execute, type Instruction } from "./vm";

export interface Ok<T> {
	ok: true;
	value: T;
}

export interface Err<X> {
	ok: false;
	error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export interface Error {
	// What went wrong
	cause : string,

	// Why it went wrong
	reason : string,

	// How to fix it
	fix : string
}

export function ok<T>(value : T) : Ok<T> {
	return { ok: true, value };
}

export function err<X>(error : X) : Err<X> {
	return { ok: false, error };
}

export function compile(source: string): Result<Instruction[], Error> {
  // TODO, this will get rather complex!
  // This is the function you should probably implement

  return ok([]);
}

export function run (source : string, stdIn : number[]) : Result<number, Error> {
	const instructions = compile(source);
	if (!instructions.ok) {
		return err(instructions.error);
	}

	return ok(
    execute(
      instructions.value,
      () => {
        // Read from stdIn
        return stdIn.shift() ?? 0;
      },
      (value: number) => {
        // Write to stdout
        console.log("Output:", value);
      },
    ),
  );
}