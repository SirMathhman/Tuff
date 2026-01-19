import { execute, Instruction } from "./execute";

function compile(source : string) : Instruction[] {
	// TODO: real implementation
	return [];
}

export function run(source : string, input : number[]) : [number[], number] {
	const instructions = compile(source);
	let inputPointer = 0;
	let output : number[] = [];
	let returnValue = execute(instructions, 
		() => {
			const value = input[inputPointer];
			inputPointer++;
			return value;
		},
		(outputValue : number) => {
			output.push(outputValue);
		}
	);
	return [output, returnValue];	
}