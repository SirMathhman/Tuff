import { interpret } from './src/interpret';

const testCases = [
	'{ fn get() => 100; } get()',
	'fn get() => 100; get()',
	'{ let x = 5; } x',
	'{ fn f() => 42; f() }',
];

for (const test of testCases) {
	const result = interpret(test);
	console.log(`"${test}" => ${JSON.stringify(result)}`);
}
