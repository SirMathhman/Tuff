function parseI32(): string {
	return 'parseInt(globalThis.__getNextInput__(), 10)';
}

function parseU8(): string {
	return '(v=>{if(v<0||v>255){process.exitCode=1;return 0;}return v;})(parseInt(globalThis.__getNextInput__(),10))';
}

/**
 * Converts Tuff type annotation to JavaScript code for parsing stdin.
 */
function compileReadFunction(typeAnnotation: string): string {
	const type = typeAnnotation.trim();
	if (type === 'I32' || type === 'i32') {
		return parseI32();
	}
	if (type === 'U8' || type === 'u8') {
		return parseU8();
	}
	return `(() => { throw new Error('Unsupported type: ${type}'); })()`;
}

export function replaceReadCalls(jsCode: string): string {
	const readStart = 'read<';
	let current = 0;
	let output = '';

	while (current < jsCode.length) {
		const idx = jsCode.indexOf(readStart, current);
		if (idx === -1) {
			output = output + jsCode.substring(current);
			break;
		}

		output = output + jsCode.substring(current, idx);
		const afterRead = idx + readStart.length;
		const closeIdx = jsCode.indexOf('>()', afterRead);
		if (closeIdx === -1) {
			output = output + jsCode.substring(idx);
			break;
		}

		const type = jsCode.substring(afterRead, closeIdx);
		output = output + compileReadFunction(type);
		current = closeIdx + 3;
	}

	return output;
}

function buildStdinSetup(): string {
	return "const __stdin__=require('fs').readFileSync(0,'utf-8').trim().split(/\\s+/);let __idx__=0;globalThis.__getNextInput__=()=>__idx__<__stdin__.length?__stdin__[__idx__++]:null;";
}

function buildResultWrapper(code: string): string {
	return `const __result__ = ${code}; console.log(__result__); process.exitCode = 0;`;
}

export function wrapCompiledCode(code: string, usesStdin: boolean): string {
	const strictMode = "'use strict';";
	const wrapped = buildResultWrapper(code);
	if (usesStdin) {
		return strictMode + buildStdinSetup() + wrapped;
	}
	return strictMode + wrapped;
}
