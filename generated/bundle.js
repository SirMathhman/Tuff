process.exit((function() {
const __tuff_native_module_lib = (function() {
const exports = {};
const module = { exports: exports };
"use strict";
// This file is expected to change substantially and should not be depended on for tests.
Object.defineProperty(exports, "__esModule", { value: true });
exports.alloc = alloc;
exports.free = free;
exports.checkMemoryOrPanic = checkMemoryOrPanic;
exports.readContent = readContent;
exports.println = println;
let allocated = 0;
function alloc(length) {
    allocated += length;
    return new Array(length);
}
function free(toFree) {
    allocated -= toFree.length;
}
function checkMemoryOrPanic() {
    if (allocated !== 0) {
        throw new Error('Memory leak detected: ' + allocated + ' items still allocated. Compiled code did not free all allocated memory as expected.');
    }
}
const fs = require("fs");
function readContent() {
    // READ the README.md file using fs
    return fs.readFileSync('README.md', 'utf-8');
}
function println(content) {
    console.log(content);
}

return module.exports;
})();
const __tuff_native_module_index = (function() {
const exports = {};
const module = { exports: exports };
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.add = add;
exports.interpretAll = interpretAll;
exports.buildReplInputs = buildReplInputs;
exports.compile = compile;
exports.execute = execute;
exports.compileAll = compileAll;
exports.interpret = interpret;
let currentNativeFunctions = null;
let currentNativeFunctionReturnTypes = null;
let nativeArrayCounter = 0;
function add(a, b) {
    return a + b;
}
function transpileNativeSource(source) {
    const ts = require('typescript');
    return ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}
function extractUseStatements(source) {
    const deps = [];
    const externDeps = [];
    const externLetsList = [];
    const externFnsList = [];
    const useRegex = /use\s*\{\s*[^}]*\s*\}\s*from\s+([a-zA-Z_]\w*)\s*;?/g;
    const externUseRegex = /extern\s+use\s*\{\s*([^}]+)\s*\}\s*from\s+([a-zA-Z_]\w*)\s*;?/g;
    let externMatch = externUseRegex.exec(source);
    while (externMatch) {
        const rawNames = externMatch[1]
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
        externDeps.push({ module: externMatch[2], names: rawNames });
        externMatch = externUseRegex.exec(source);
    }
    const sourceWithoutExtern = source.replace(externUseRegex, '');
    let match = useRegex.exec(sourceWithoutExtern);
    while (match) {
        deps.push(match[1]);
        match = useRegex.exec(sourceWithoutExtern);
    }
    const externLetRegex = /extern\s+let\s+([a-zA-Z_]\w*)\s*:\s*([^;]+);?/g;
    let externLetMatch = externLetRegex.exec(source);
    while (externLetMatch) {
        externLetsList.push({ name: externLetMatch[1], type: externLetMatch[2].trim() });
        externLetMatch = externLetRegex.exec(source);
    }
    const externFnRegex = /extern\s+fn\s+([a-zA-Z_]\w*)\s*(<\s*[^>]+\s*>)?\s*\(([^)]*)\)\s*(?::\s*([^;]+))?;?/g;
    let externFnMatch = externFnRegex.exec(source);
    while (externFnMatch) {
        externFnsList.push({
            name: externFnMatch[1],
            generics: externFnMatch[2] ? externFnMatch[2].trim() : '',
            params: externFnMatch[3].trim(),
            returnType: externFnMatch[4] ? externFnMatch[4].trim() : 'I32',
        });
        externFnMatch = externFnRegex.exec(source);
    }
    const code = sourceWithoutExtern.replace(externUseRegex, '').replace(externLetRegex, '').replace(externFnRegex, '').replace(useRegex, '').trim();
    return { code, deps, externDeps, externLets: externLetsList, externFns: externFnsList };
}
function parseNativeExports(source) {
    const constExports = new Map();
    const fnExports = new Map();
    const jsCode = transpileNativeSource(source);
    const wrapped = ['const exports = {};', 'const module = { exports };', jsCode, 'return module.exports;'].join('\n');
    try {
        const getExports = new Function('require', wrapped);
        const exportsObj = getExports(require);
        for (const [key, value] of Object.entries(exportsObj)) {
            if (typeof value !== 'function') {
                constExports.set(key, String(value));
            }
        }
        for (const [key, value] of Object.entries(exportsObj)) {
            if (typeof value === 'function') {
                const fn = value;
                const paramNames = Array.from({ length: fn.length }, (_v, i) => 'arg' + i);
                fnExports.set(key, { fn: fn, paramNames });
            }
        }
    }
    catch (err) {
        throw new Error('failed to execute native code: ' + err.message);
    }
    return { constExports, fnExports };
}
function collectModulePlan(inputs, config, nativeConfig) {
    const moduleMap = new Map();
    for (const [key, value] of config) {
        if (key.length > 0) {
            moduleMap.set(key[0], value);
        }
    }
    const nativeModuleMap = new Map();
    for (const [key, value] of nativeConfig) {
        if (key.length > 0) {
            nativeModuleMap.set(key[0], value);
        }
    }
    const visited = new Set();
    const parts = [];
    const externUses = [];
    const externLets = [];
    const externFns = [];
    function appendCode(code) {
        if (!code)
            return;
        const trimmed = code.trim();
        if (!trimmed)
            return;
        parts.push(trimmed);
    }
    function includeModule(name) {
        if (visited.has(name))
            return;
        visited.add(name);
        const raw = moduleMap.get(name);
        if (raw === undefined) {
            throw new Error('module not found: ' + name);
        }
        const extracted = extractUseStatements(raw);
        for (const dep of extracted.deps) {
            includeModule(dep);
        }
        externUses.push(...extracted.externDeps);
        externLets.push(...extracted.externLets);
        externFns.push(...extracted.externFns);
        appendCode(extracted.code);
    }
    for (const input of inputs) {
        includeModule(input);
    }
    return { parts, externUses, externLets, externFns, moduleMap, nativeModuleMap };
}
function buildMissingNativeExportMessage(exportName, moduleName) {
    return ('native export not found: ' +
        exportName +
        '. Cause: extern use references a native export that does not exist. Fix: export ' +
        exportName +
        ' from ' +
        moduleName +
        '.ts or remove it. Context: module ' +
        moduleName +
        '.');
}
function buildMissingNativeModuleMessage(moduleName, contextInfo) {
    return ('native module not found: ' +
        moduleName +
        '. Cause: extern use references a native module that is not loaded. Reason: native modules must be provided via nativeConfig or src/' +
        moduleName +
        '.ts in the REPL loader. Fix: add ' +
        moduleName +
        '.ts with the required exports or update the extern use. Context: ' +
        contextInfo +
        '.');
}
function buildNativeExportsByModule(nativeModuleMap) {
    const nativeExportsByModule = new Map();
    for (const [moduleName, source] of nativeModuleMap) {
        nativeExportsByModule.set(moduleName, parseNativeExports(source));
    }
    return nativeExportsByModule;
}
function resolveExternUses(externUses, nativeModuleMap, nativeExportsByModule) {
    const externValueByName = new Map();
    const externFnByName = new Map();
    const externFnModuleByName = new Map();
    for (const externUse of externUses) {
        const nativeSource = nativeModuleMap.get(externUse.module);
        if (!nativeSource) {
            throw new Error(buildMissingNativeModuleMessage(externUse.module, 'extern use { ' + externUse.names.join(', ') + ' } from ' + externUse.module));
        }
        const nativeExports = nativeExportsByModule.get(externUse.module);
        if (!nativeExports) {
            throw new Error(buildMissingNativeModuleMessage(externUse.module, 'extern use { ' + externUse.names.join(', ') + ' } from ' + externUse.module));
        }
        for (const name of externUse.names) {
            const constValue = nativeExports.constExports.get(name);
            const fnValue = nativeExports.fnExports.get(name);
            if (constValue) {
                externValueByName.set(name, constValue);
                continue;
            }
            if (fnValue) {
                externFnByName.set(name, fnValue);
                externFnModuleByName.set(name, externUse.module);
                continue;
            }
            throw new Error(buildMissingNativeExportMessage(name, externUse.module));
        }
    }
    return { externValueByName, externFnByName, externFnModuleByName };
}
function resolveExternBindings(externUses, externFns, nativeModuleMap) {
    const nativeExportsByModule = buildNativeExportsByModule(nativeModuleMap);
    const resolvedUses = resolveExternUses(externUses, nativeModuleMap, nativeExportsByModule);
    const resolvedFns = resolveExternFns(externFns, externUses, resolvedUses.externFnByName, nativeExportsByModule, resolvedUses.externFnModuleByName);
    return {
        nativeExportsByModule,
        externValueByName: resolvedUses.externValueByName,
        externFnByName: resolvedUses.externFnByName,
        resolvedFns,
    };
}
function prepareExternBindings(inputs, config, nativeConfig) {
    const plan = collectModulePlan(inputs, config, nativeConfig);
    const hasContent = plan.parts.length > 0 || plan.externLets.length > 0 || plan.externFns.length > 0;
    if (!hasContent) {
        return { plan, externBindings: null, hasContent: false };
    }
    const externBindings = resolveExternBindings(plan.externUses, plan.externFns, plan.nativeModuleMap);
    return { plan, externBindings, hasContent };
}
function resolveExternFns(externFns, externUses, externFnByName, nativeExportsByModule, externFnModuleByName) {
    const nativeFunctionTable = new Map();
    const nativeFunctionReturnTypesLocal = new Map();
    for (const externFn of externFns) {
        const fnBody = externFnByName.get(externFn.name);
        if (!fnBody) {
            const matches = [];
            for (const [moduleName, nativeExports] of nativeExportsByModule) {
                const found = nativeExports.fnExports.get(externFn.name);
                if (found) {
                    matches.push({ module: moduleName, fn: found });
                }
            }
            if (matches.length === 1) {
                nativeFunctionTable.set(externFn.name, matches[0].fn);
                nativeFunctionReturnTypesLocal.set(externFn.name, externFn.returnType);
                externFnModuleByName.set(externFn.name, matches[0].module);
                continue;
            }
            const moduleName = externUses.length === 1 ? externUses[0].module : 'unknown';
            if (matches.length > 1) {
                const message = 'native export not found: ' +
                    externFn.name +
                    '. Cause: extern fn matches multiple native modules. Reason: extern functions must resolve to a single native module. Fix: add extern use { ' +
                    externFn.name +
                    ' } from <module> to disambiguate. Context: module ' +
                    moduleName +
                    '.';
                throw new Error(message);
            }
            const message = 'native export not found: ' +
                externFn.name +
                '. Cause: extern fn declares a native symbol without a matching export. Reason: extern functions must be provided by a native module. Fix: add extern use { ' +
                externFn.name +
                ' } from ' +
                moduleName +
                ' and export it from ' +
                moduleName +
                '.ts. Context: module ' +
                moduleName +
                '.';
            throw new Error(message);
        }
        nativeFunctionTable.set(externFn.name, fnBody);
        nativeFunctionReturnTypesLocal.set(externFn.name, externFn.returnType);
    }
    return { nativeFunctionTable, nativeFunctionReturnTypesLocal, externFnModuleByName };
}
function buildExternPreludeParts(externLets, externValueByName) {
    const externPreludeParts = [];
    for (const externLet of externLets) {
        const value = externValueByName.get(externLet.name);
        if (!value) {
            throw new Error('native export not found: ' + externLet.name);
        }
        externPreludeParts.push(['let ', externLet.name, ' : ', externLet.type, ' = ', value, ';'].join(''));
    }
    return externPreludeParts;
}
function combineCodeParts(parts) {
    let combined = '';
    for (const part of parts) {
        if (!combined) {
            combined = part;
            continue;
        }
        const needsSeparator = !combined.trim().endsWith(';') && !part.trim().startsWith(';');
        combined += needsSeparator ? ';' : '';
        combined += part;
    }
    return combined;
}
function stripExplicitTypeArgsFromCalls(source) {
    const regex = /\b([a-zA-Z_]\w*)\s*<\s*[^>]*\s*>\s*\(/g;
    return source.replace(regex, (match, name, offset, full) => {
        const before = full.slice(0, offset);
        const prevWordMatch = before.match(/([a-zA-Z_]\w*)\s*$/);
        if (prevWordMatch && prevWordMatch[1] === 'fn') {
            return match;
        }
        return name + '(';
    });
}
function interpretAll(inputs, config, nativeConfig) {
    const prepared = prepareExternBindings(inputs, config, nativeConfig);
    if (!prepared.hasContent || !prepared.externBindings)
        return 0;
    const { parts, externLets } = prepared.plan;
    const externValueByName = prepared.externBindings.externValueByName;
    const nativeFunctionTable = prepared.externBindings.resolvedFns.nativeFunctionTable;
    const nativeFunctionReturnTypesLocal = prepared.externBindings.resolvedFns.nativeFunctionReturnTypesLocal;
    const externPreludeParts = buildExternPreludeParts(externLets, externValueByName);
    const combined = combineCodeParts(externPreludeParts.concat(parts));
    if (!combined.trim())
        return 0;
    const previousNative = currentNativeFunctions;
    const previousNativeReturnTypes = currentNativeFunctionReturnTypes;
    currentNativeFunctions = nativeFunctionTable;
    currentNativeFunctionReturnTypes = nativeFunctionReturnTypesLocal;
    try {
        return interpret(combined);
    }
    finally {
        currentNativeFunctions = previousNative;
        currentNativeFunctionReturnTypes = previousNativeReturnTypes;
    }
}
function buildReplInputs(rootDir) {
    const fs = require('fs');
    const path = require('path');
    const srcDir = path.join(rootDir, 'src');
    if (!fs.existsSync(srcDir)) {
        throw new Error('src directory not found');
    }
    const config = new Map();
    const nativeConfig = new Map();
    const collectFiles = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                collectFiles(fullPath);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!entry.name.endsWith('.tuff') && !entry.name.endsWith('.ts'))
                continue;
            const relPath = path.relative(srcDir, fullPath);
            const segments = relPath.split(path.sep);
            const fileName = segments[segments.length - 1];
            const baseName = fileName.replace(/\.(tuff|ts)$/, '');
            const key = segments.slice(0, -1).concat(baseName);
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (entry.name.endsWith('.tuff')) {
                config.set(key, content);
            }
            else {
                nativeConfig.set(key, content);
            }
        }
    };
    collectFiles(srcDir);
    if (!config.has(['index'])) {
        const hasIndex = Array.from(config.keys()).some((key) => key.length === 1 && key[0] === 'index');
        if (!hasIndex) {
            throw new Error('index.tuff not found');
        }
    }
    return { inputs: ['index'], config, nativeConfig };
}
/**
 * Compile Tuff code to JavaScript.
 * Takes a Tuff program as input and returns transpiled JavaScript code.
 * @param input - Tuff source code
 * @returns JavaScript code
 */
function compile(input) {
    // Strip comments using simple regex (handles most cases)
    let code = input
        .replace(/\/\/.*$/gm, '') // strip line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
        .trim();
    const originalCode = code;
    if (!code) {
        return 'return 0;';
    }
    if (/^[a-zA-Z_]\w*(\s+[a-zA-Z_]\w*)+$/.test(code)) {
        return 'return 0;';
    }
    // Validate parentheses are balanced
    let parenCount = 0;
    for (const char of code) {
        if (char === '(')
            parenCount++;
        if (char === ')')
            parenCount--;
        if (parenCount < 0)
            throw new Error('unmatched closing parenthesis');
    }
    if (parenCount !== 0)
        throw new Error('unmatched opening parenthesis');
    // Handle boolean literals
    code = code.replace(/\btrue\b/g, '1').replace(/\bfalse\b/g, '0');
    validateNumericLiteralSuffixes(code);
    // Handle numeric literals with type suffixes (e.g., 100U8, -128I8)
    code = code.replace(/-?\b\d+(?:U8|U16|U32|U64|USize|I8|I16|I32|I64)\b/g, (match) => {
        // Parse the numeric suffix
        const suffixMatch = match.match(/(?:U8|U16|U32|U64|USize|I8|I16|I32|I64)$/);
        if (!suffixMatch)
            return match;
        const suffix = suffixMatch[0];
        const numStr = match.slice(0, -suffix.length);
        const num = parseInt(numStr, 10);
        // Validate range based on suffix
        const ranges = {
            U8: [0, 255],
            U16: [0, 65535],
            U32: [0, 4294967295],
            U64: [0, 18446744073709551615],
            USize: [0, 18446744073709551615],
            I8: [-128, 127],
            I16: [-32768, 32767],
            I32: [-2147483648, 2147483647],
            I64: [-9223372036854775808, 9223372036854775807],
        };
        const [min, max] = ranges[suffix];
        if (num < min || num > max) {
            // Return an invalid token to trigger compile error
            // We use a marker that the validator will reject
            return '__OVERFLOW__';
        }
        // Return the number without suffix
        return numStr;
    });
    // Check for overflow markers
    if (code.includes('__OVERFLOW__')) {
        throw new Error('numeric literal overflow');
    }
    // Handle block expressions - check if entire code is a block
    if (code.startsWith('{')) {
        // Find the matching closing brace
        let braceCount = 0;
        let blockEnd = -1;
        for (let i = 0; i < code.length; i++) {
            if (code[i] === '{')
                braceCount++;
            if (code[i] === '}')
                braceCount--;
            if (braceCount === 0) {
                blockEnd = i;
                break;
            }
        }
        if (blockEnd === -1) {
            throw new Error('unmatched opening brace');
        }
        // If the block is the entire expression, convert it to IIFE
        if (blockEnd === code.length - 1) {
            const blockContent = code.slice(1, blockEnd).trim();
            const blockCode = convertBlockToIIFE(blockContent, undefined);
            return 'return (' + blockCode + ')();';
        }
    }
    // Handle let statements and track mutability
    const mutableVars = new Set();
    const definedVars = new Set();
    const varTypes = new Map();
    const varNumericSuffixes = new Map();
    const varInitialized = new Map();
    const varDropFns = new Map();
    const stringVars = new Set();
    const implicitNumericVars = new Set();
    const untypedVars = new Set();
    const fnPointerVars = new Set();
    const thisPointerVars = new Set();
    const thisMemberSets = new Map();
    const thisValueMembers = new Map();
    const pointerTargets = new Map();
    const pointerMutableTargets = new Map();
    const pointerVarKinds = new Map();
    const pointerVarIsMutable = new Map();
    const arrayVars = new Map();
    const arrayPointerTargets = new Map();
    const arrayPointerVarIsMutable = new Map();
    const fnArrayParamRequirements = new Map();
    const fnSignatures = new Map();
    const structDefs = new Map();
    const structVarTypes = new Map();
    const structVarFieldKinds = new Map();
    const typeAliases = new Map();
    const singletonMethods = new Map();
    const context = {
        mutableVars,
        definedVars,
        varTypes,
        varNumericSuffixes,
        varInitialized,
        varDropFns,
        stringVars,
        implicitNumericVars,
        untypedVars,
        fnPointerVars,
        thisPointerVars,
        thisMemberSets,
        thisValueMembers,
        pointerTargets,
        pointerMutableTargets,
        pointerVarKinds,
        pointerVarIsMutable,
        arrayVars,
        arrayPointerTargets,
        arrayPointerVarIsMutable,
        fnArrayParamRequirements,
        fnSignatures,
        structDefs,
        structVarTypes,
        structVarFieldKinds,
        typeAliases,
        singletonMethods,
    };
    currentStructNames = new Set();
    currentTypeAliasNames = new Set();
    let jsCode = '';
    // Replace inline blocks with IIFEs
    code = replaceInlineBlocks(code);
    // Split by semicolons while preserving the rest
    const stmts = splitStatements(code);
    const stmtsOriginal = splitStatements(originalCode);
    preRegisterTypeAliases(stmtsOriginal, context);
    // Process all statements except the last
    for (let i = 0; i < stmts.length - 1; i++) {
        let stmt = stmts[i];
        let stmtOriginal = stmtsOriginal[i] || stmt;
        let structOnly = false;
        let objectOnly = false;
        let fnOnly = false;
        while (true) {
            const leadingStruct = splitLeadingStructDeclaration(stmtOriginal);
            if (!leadingStruct) {
                break;
            }
            const structDecl = parseStructDeclaration(leadingStruct.declaration);
            if (!structDecl) {
                throw new Error('invalid struct declaration');
            }
            registerStructDeclaration(structDecl, context);
            if (!leadingStruct.trailing) {
                structOnly = true;
                break;
            }
            stmt = leadingStruct.trailing;
            stmtOriginal = leadingStruct.trailing;
        }
        while (true) {
            const leadingObject = splitLeadingObjectDeclaration(stmtOriginal);
            if (!leadingObject) {
                break;
            }
            const objectDecl = parseObjectDeclaration(leadingObject.declaration);
            if (!objectDecl) {
                throw new Error('invalid object declaration');
            }
            jsCode += buildObjectDeclaration(objectDecl, context) + ' ';
            if (!leadingObject.trailing) {
                objectOnly = true;
                break;
            }
            stmt = leadingObject.trailing;
            stmtOriginal = leadingObject.trailing;
        }
        if (structOnly || objectOnly) {
            continue;
        }
        if (parseTypeAliasDeclaration(stmtOriginal)) {
            continue;
        }
        while (true) {
            const leadingFn = splitLeadingFunctionDefinition(stmtOriginal);
            if (!leadingFn) {
                break;
            }
            const fnDefOriginal = parseFunctionDefinitionForCompile(leadingFn.definition);
            if (!fnDefOriginal) {
                throw buildInvalidFunctionDefinitionError(leadingFn.definition);
            }
            jsCode += emitFunctionDefinition(fnDefOriginal, fnDefOriginal, context, fnArrayParamRequirements) + ' ';
            if (!leadingFn.trailing) {
                fnOnly = true;
                break;
            }
            stmt = leadingFn.trailing;
            stmtOriginal = leadingFn.trailing;
        }
        if (fnOnly) {
            continue;
        }
        const whileMatchOriginal = stmtOriginal.match(/^while\s*\((.+)\)\s*(.+)$/);
        if (whileMatchOriginal) {
            const conditionOriginal = whileMatchOriginal[1].trim();
            const whileMatch = stmt.match(/^while\s*\((.+)\)\s*(.+)$/);
            const condition = whileMatch ? whileMatch[1].trim() : conditionOriginal;
            const body = whileMatch ? whileMatch[2].trim() : whileMatchOriginal[2].trim();
            ensureWhileConditionBool(conditionOriginal, varTypes);
            const whileResult = buildWhileLoop(condition, body);
            jsCode += whileResult.loopCode;
            if (whileResult.trailing) {
                jsCode += whileResult.trailing + '; ';
            }
            continue;
        }
        const fnDefOriginal = parseFunctionDefinitionForCompile(stmtOriginal);
        if (fnDefOriginal) {
            const fnDef = parseFunctionDefinitionForCompile(stmt) || fnDefOriginal;
            jsCode += emitFunctionDefinition(fnDef, fnDefOriginal, context, fnArrayParamRequirements) + ' ';
            continue;
        }
        // Check if this is a let statement
        const parsedLet = parseLetStatementForCompile(stmtOriginal);
        if (parsedLet) {
            if (parsedLet.expr !== undefined) {
                const parsedLetConverted = parseLetStatementForCompile(stmt) || parsedLet;
                const letSnippet = handleLetInitializer(parsedLet.varName, parsedLet.typeAnnotation, parsedLetConverted.expr || parsedLet.expr, parsedLet.expr, parsedLet.isMutable, context);
                jsCode += letSnippet;
            }
            else {
                const letSnippet = handleLetNoInit(parsedLet.varName, parsedLet.typeAnnotation, parsedLet.isMutable, context);
                jsCode += letSnippet;
            }
            continue;
        }
        const thisAssignMatch = stmt.match(/^this\s*\.\s*([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
        if (thisAssignMatch) {
            const varName = thisAssignMatch[1];
            const operator = thisAssignMatch[2];
            const value = thisAssignMatch[3];
            const valueOriginalMatch = stmtOriginal.match(/^this\s*\.\s*([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
            const valueOriginal = valueOriginalMatch ? valueOriginalMatch[3] : value;
            const assignSnippet = buildThisFieldAssignment(varName, operator, value, valueOriginal, context);
            jsCode += assignSnippet;
            continue;
        }
        const thisPointerAssignMatch = stmt.match(/^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
        if (thisPointerAssignMatch && context.thisPointerVars.has(thisPointerAssignMatch[1])) {
            const varName = thisPointerAssignMatch[2];
            const operator = thisPointerAssignMatch[3];
            const value = thisPointerAssignMatch[4];
            const valueOriginalMatch = stmtOriginal.match(/^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
            const valueOriginal = valueOriginalMatch ? valueOriginalMatch[4] : value;
            const assignSnippet = buildThisFieldAssignment(varName, operator, value, valueOriginal, context);
            jsCode += assignSnippet;
            continue;
        }
        const arrayAssignMatch = stmt.match(/^([a-zA-Z_]\w*)\s*\[\s*([^\]]+)\s*\]\s*=\s*(.+)$/);
        if (arrayAssignMatch) {
            const arrayName = arrayAssignMatch[1];
            const indexExpr = arrayAssignMatch[2].trim();
            const valueExpr = arrayAssignMatch[3];
            validateArrayElementAssignment(arrayName, indexExpr, valueExpr, mutableVars, definedVars, arrayVars, arrayPointerTargets, context.arrayPointerVarIsMutable, varTypes, varNumericSuffixes);
            const convertedValue = normalizeRefs(convertIfElseToTernary(valueExpr));
            const convertedIndex = normalizeRefs(convertIfElseToTernary(indexExpr));
            jsCode += arrayName + '[' + convertedIndex + '] = ' + convertedValue + '; ';
            continue;
        }
        const derefAssignMatch = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/);
        if (derefAssignMatch) {
            const ptrName = derefAssignMatch[1];
            const valueExpr = derefAssignMatch[2];
            const target = context.pointerTargets.get(ptrName);
            if (!target) {
                throw new Error('cannot dereference non-pointer type');
            }
            if (!context.pointerVarIsMutable.get(ptrName)) {
                throw new Error('cannot assign through immutable pointer');
            }
            const convertedValue = prepareValueExpression(valueExpr, valueExpr, context, true, true);
            jsCode += target + ' = ' + convertedValue + '; ';
            continue;
        }
        // Check if this is an assignment
        const assignMatch = stmt.match(/^(\w+)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
        if (assignMatch) {
            const varName = assignMatch[1];
            const operator = assignMatch[2];
            const value = assignMatch[3];
            const valueOriginalMatch = stmtOriginal.match(/^(\w+)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
            const valueOriginal = valueOriginalMatch ? valueOriginalMatch[3] : value;
            const assignSnippet = handleAssignment(varName, operator, value, valueOriginal, context);
            jsCode += assignSnippet;
            continue;
        }
        const callExprMatch = stmt.match(/^[a-zA-Z_][\w\.]*\s*\([\s\S]*\)$/);
        if (callExprMatch) {
            const exprConverted = prepareValueExpression(stmt, stmtOriginal, context, true, false);
            jsCode += exprConverted + '; ';
            continue;
        }
        // Unknown statement
        throw new Error('Invalid statement: "' +
            stmtOriginal.substring(0, 50) +
            (stmtOriginal.length > 50 ? '...' : '') +
            '". Expected a variable declaration (let/let mut), assignment, function call, while loop, struct/object definition, type alias, or function definition. Check for missing semicolons or syntax errors.');
    }
    // Process the final statement as a return expression
    if (stmts.length > 0) {
        let lastStmt = stmts[stmts.length - 1];
        let lastStmtOriginal = stmtsOriginal[stmtsOriginal.length - 1] || lastStmt;
        if (parseTypeAliasDeclaration(lastStmtOriginal)) {
            jsCode += buildDropCalls(context);
            jsCode += 'return 0;';
            return jsCode;
        }
        const lastWhileOriginal = lastStmtOriginal.match(/^while\s*\((.+)\)\s*(.+)$/);
        if (lastWhileOriginal) {
            const conditionOriginal = lastWhileOriginal[1].trim();
            const lastWhile = lastStmt.match(/^while\s*\((.+)\)\s*(.+)$/);
            const condition = lastWhile ? lastWhile[1].trim() : conditionOriginal;
            const body = lastWhile ? lastWhile[2].trim() : lastWhileOriginal[2].trim();
            ensureWhileConditionBool(conditionOriginal, varTypes);
            const lastWhileResult = buildWhileLoop(condition, body);
            jsCode += lastWhileResult.loopCode;
            if (lastWhileResult.trailing) {
                lastStmt = lastWhileResult.trailing;
            }
            else {
                jsCode += buildDropCalls(context);
                jsCode += 'return 0;';
                return jsCode;
            }
        }
        const lastBlockOriginal = splitLeadingBlockExpression(lastStmtOriginal);
        const lastBlockConverted = splitLeadingBlockExpression(lastStmt);
        if (lastBlockConverted && lastBlockOriginal) {
            const blockCode = convertBlockToIIFE(lastBlockConverted.blockContent, context.typeAliases);
            jsCode += '(' + blockCode + ')(); ';
            if (lastBlockConverted.trailing) {
                lastStmt = lastBlockConverted.trailing;
                lastStmtOriginal = lastBlockOriginal.trailing;
            }
            else {
                jsCode += buildDropCalls(context);
                jsCode += 'return 0;';
                return jsCode;
            }
        }
        while (true) {
            const finalStructSplit = splitLeadingStructDeclaration(lastStmtOriginal);
            if (!finalStructSplit) {
                break;
            }
            const structDecl = parseStructDeclaration(finalStructSplit.declaration);
            if (!structDecl) {
                throw new Error('invalid struct declaration');
            }
            registerStructDeclaration(structDecl, context);
            if (!finalStructSplit.trailing) {
                jsCode += buildDropCalls(context);
                jsCode += 'return 0;';
                return jsCode;
            }
            lastStmtOriginal = finalStructSplit.trailing;
            lastStmt = finalStructSplit.trailing;
        }
        while (true) {
            const finalObjectSplit = splitLeadingObjectDeclaration(lastStmtOriginal);
            if (!finalObjectSplit) {
                break;
            }
            const objectDecl = parseObjectDeclaration(finalObjectSplit.declaration);
            if (!objectDecl) {
                throw new Error('invalid object declaration');
            }
            jsCode += buildObjectDeclaration(objectDecl, context) + ' ';
            if (!finalObjectSplit.trailing) {
                jsCode += buildDropCalls(context);
                jsCode += 'return 0;';
                return jsCode;
            }
            lastStmtOriginal = finalObjectSplit.trailing;
            lastStmt = finalObjectSplit.trailing;
        }
        const leadingFn = splitLeadingFunctionDefinition(lastStmtOriginal);
        if (leadingFn) {
            const fnDef = parseFunctionDefinitionForCompile(leadingFn.definition);
            if (!fnDef) {
                throw buildInvalidFunctionDefinitionError(leadingFn.definition);
            }
            const parsedParams = parseFnParams(fnDef.params, context);
            for (const param of parsedParams) {
                if (param.arrayInfo) {
                    registerFnArrayParam(fnArrayParamRequirements, fnDef.name, param.index, param.arrayInfo);
                }
            }
            registerFunctionSignature(fnDef.name, parsedParams, fnDef.returnType, fnDef.body, context);
            jsCode += buildFunctionDefinition(fnDef.name, parsedParams, fnDef.body, context.typeAliases) + ' ';
            if (!leadingFn.trailing) {
                jsCode += buildDropCalls(context);
                jsCode += 'return 0;';
                return jsCode;
            }
            lastStmtOriginal = leadingFn.trailing;
            lastStmt = leadingFn.trailing;
        }
        const lastLetOriginal = lastStmtOriginal.match(/^let\s+(mut\s+)?(\w+)\s*(?::\s*([^=]+?))?\s*=\s*(.+)$/);
        if (lastLetOriginal) {
            const isMutable = !!lastLetOriginal[1];
            const varName = lastLetOriginal[2];
            const typeAnnotation = lastLetOriginal[3] ? lastLetOriginal[3].trim() : undefined;
            const varValueOriginal = lastLetOriginal[4];
            const lastLet = lastStmt.match(/^let\s+(mut\s+)?(\w+)\s*(?::\s*([^=]+?))?\s*=\s*(.+)$/);
            const varValue = lastLet ? lastLet[4] : varValueOriginal;
            const letSnippet = handleLetInitializer(varName, typeAnnotation, varValue, varValueOriginal, isMutable, context);
            jsCode += letSnippet;
            jsCode += buildDropCalls(context);
            jsCode += 'return 0;';
            return jsCode;
        }
        const lastLetNoInit = lastStmt.match(/^let\s+(mut\s+)?(\w+)\s*(?::\s*([^=]+?))?$/);
        if (lastLetNoInit) {
            const isMutable = !!lastLetNoInit[1];
            const varName = lastLetNoInit[2];
            const typeAnnotation = lastLetNoInit[3] ? lastLetNoInit[3].trim() : undefined;
            const letSnippet = handleLetNoInit(varName, typeAnnotation, isMutable, context);
            jsCode += letSnippet;
            jsCode += buildDropCalls(context);
            jsCode += 'return 0;';
            return jsCode;
        }
        const lastAssignOriginal = lastStmtOriginal.match(/^(\w+)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
        if (lastAssignOriginal) {
            const varName = lastAssignOriginal[1];
            const operator = lastAssignOriginal[2];
            const valueOriginal = lastAssignOriginal[3];
            const lastAssign = lastStmt.match(/^(\w+)\s*(\+=|-=|\*=|\/=|=(?!=))\s*(.+)$/);
            const value = lastAssign ? lastAssign[3] : valueOriginal;
            const assignSnippet = handleAssignment(varName, operator, value, valueOriginal, context);
            jsCode += assignSnippet;
            jsCode += buildDropCalls(context);
            jsCode += 'return 0;';
            return jsCode;
        }
        ensureNoBoolArithmetic(lastStmtOriginal, varTypes);
        inferExprInfo(lastStmtOriginal, varTypes, varNumericSuffixes);
        // Handle if/else expressions by converting to ternary operators
        lastStmt = convertInlineBlockExpressions(lastStmt, context.typeAliases);
        lastStmt = convertThisAccess(lastStmt);
        lastStmt = resolveMethodStyleCall(lastStmt, context).converted;
        lastStmt = convertUnboundFunctionPointerAccess(lastStmt);
        lastStmt = convertPointerDerefs(lastStmt, context);
        lastStmt = convertIsExpressions(lastStmt, context);
        lastStmt = convertStringIndexing(lastStmt, context);
        lastStmt = convertIfElseToTernary(lastStmt);
        const thisAccessNormalized = convertThisAccess(lastStmtOriginal);
        // Check for undefined variables in final expression
        if (!lastStmtOriginal.includes('::')) {
            checkUndefinedVars(thisAccessNormalized, definedVars);
        }
        validateExpressionForCompile(thisAccessNormalized, context, false);
        // Check if this is a comparison or boolean operator and wrap to convert bool to number
        // Comparison operators: ==, !=, <, >, <=, >=
        // Boolean operators: &&, ||, !
        // Use original statement to avoid matching => from arrow functions in IIFEs
        const hasBoolOp = /==|!=|(?<!=>?)<(?!=)|(?<!-)>(?!=)|<=|>=|&&|\|\||(?<![!=])!(?!=)/.test(lastStmtOriginal);
        if (hasBoolOp) {
            // Skip wrapping if this is already a ternary expression (from if/else conversion)
            const isAlreadyTernary = /\?.*:/.test(lastStmt);
            if (!isAlreadyTernary) {
                // For NOT operator, we need special handling as it's unary
                // Convert !expr to (expr ? 0 : 1)
                lastStmt = lastStmt.replace(/!(\w+)/g, '($1 ? 0 : 1)');
                lastStmt = lastStmt.replace(/!\(([^)]+)\)/g, '($1 ? 0 : 1)');
                // Wrap the whole expression if it contains comparison or logical operators
                if (/==|!=|<|>|<=|>=|&&|\|\|/.test(lastStmt)) {
                    lastStmt = '(' + lastStmt + ' ? 1 : 0)';
                }
            }
        }
        lastStmt = normalizeRefs(lastStmt);
        jsCode += buildDropCalls(context);
        // Coerce to number to handle boolean return values
        jsCode += 'return +(' + lastStmt + ');';
    }
    else {
        jsCode = 'return 0;';
    }
    return jsCode;
}
const RESERVED_KEYWORDS = new Set(['let', 'mut', 'if', 'else', 'while', 'true', 'false', 'fn', 'return', 'struct', 'is']);
function detectExprTypeSimple(expr, varTypes) {
    const trimmed = expr.trim();
    if (!trimmed)
        return 'Unknown';
    if (/\btrue\b|\bfalse\b/.test(trimmed)) {
        return 'Bool';
    }
    if (/==|!=|<|>|<=|>=|&&|\|\||!/.test(trimmed)) {
        return 'Bool';
    }
    const identMatch = trimmed.match(/^\w+$/);
    if (identMatch) {
        return varTypes.get(trimmed) || 'Unknown';
    }
    return 'Numeric';
}
function parseNumericLiteralSuffix(expr) {
    const trimmed = expr.trim();
    const match = trimmed.match(/^-?\d+(U8|U16|U32|U64|USize|I8|I16|I32|I64)$/);
    return match ? match[1] : undefined;
}
function validateNumericLiteralSuffixes(code) {
    const allowed = new Set(['U8', 'U16', 'U32', 'U64', 'USize', 'I8', 'I16', 'I32', 'I64']);
    const matches = code.match(/-?\b\d+[a-zA-Z][a-zA-Z0-9]*\b/g) || [];
    for (const token of matches) {
        const suffixMatch = token.match(/[a-zA-Z][a-zA-Z0-9]*$/);
        if (!suffixMatch)
            continue;
        const suffix = suffixMatch[0];
        if (!allowed.has(suffix)) {
            throw new Error('invalid suffix');
        }
    }
}
function getNumericSuffixRange(suffix) {
    switch (suffix) {
        case 'U8':
            return { min: 0, max: 255 };
        case 'U16':
            return { min: 0, max: 65535 };
        case 'U32':
            return { min: 0, max: 4294967295 };
        case 'U64':
            return { min: 0, max: 18446744073709551615 };
        case 'USize':
            return { min: 0, max: 18446744073709551615 };
        case 'I8':
            return { min: -128, max: 127 };
        case 'I16':
            return { min: -32768, max: 32767 };
        case 'I32':
            return { min: -2147483648, max: 2147483647 };
        case 'I64':
            return { min: -9223372036854775808, max: 9223372036854775807 };
        default:
            return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER };
    }
}
function parseNumericLiteralValue(expr) {
    const trimmed = expr.trim();
    const match = trimmed.match(/^-?\d+(U8|U16|U32|U64|USize|I8|I16|I32|I64)?$/);
    if (!match)
        return null;
    const suffix = match[1];
    const numStr = suffix ? trimmed.slice(0, -suffix.length) : trimmed;
    return { value: parseInt(numStr, 10), suffix };
}
function chooseNumericSuffix(suffixA, suffixB) {
    if (!suffixA && !suffixB)
        return undefined;
    if (suffixA && !suffixB)
        return suffixA;
    if (!suffixA && suffixB)
        return suffixB;
    if (!suffixA || !suffixB)
        return undefined;
    if (isNumericSuffixWider(suffixA, suffixB))
        return suffixA;
    if (isNumericSuffixWider(suffixB, suffixA))
        return suffixB;
    return suffixA;
}
function validateNumericLiteralOverflow(expr) {
    const trimmed = expr.trim();
    if (trimmed.includes('+')) {
        const parts = splitTopLevel(trimmed, '+')
            .map((part) => part.trim())
            .filter(Boolean);
        if (parts.length > 1) {
            const literals = parts.map((part) => parseNumericLiteralValue(part));
            if (literals.every((value) => value)) {
                let suffix;
                for (const literal of literals) {
                    if (!literal)
                        continue;
                    suffix = chooseNumericSuffix(suffix, literal.suffix);
                }
                if (suffix) {
                    const sum = literals.reduce((total, literal) => total + (literal ? literal.value : 0), 0);
                    const range = getNumericSuffixRange(suffix);
                    if (sum < range.min || sum > range.max) {
                        throw new Error('numeric literal overflow');
                    }
                }
            }
        }
    }
    const match = trimmed.match(/^(-?\d+(?:U8|U16|U32|U64|USize|I8|I16|I32|I64)?)\s*\+\s*(-?\d+(?:U8|U16|U32|U64|USize|I8|I16|I32|I64)?)$/);
    if (!match)
        return;
    const left = parseNumericLiteralValue(match[1]);
    const right = parseNumericLiteralValue(match[2]);
    if (!left || !right)
        return;
    const suffix = chooseNumericSuffix(left.suffix, right.suffix);
    if (!suffix)
        return;
    const result = left.value + right.value;
    const range = getNumericSuffixRange(suffix);
    if (result < range.min || result > range.max) {
        throw new Error('numeric literal overflow');
    }
}
function validateDivisionByZero(expr) {
    const trimmed = expr.trim();
    const regex = /\//g;
    let match;
    while ((match = regex.exec(trimmed)) !== null) {
        const index = match.index;
        const before = trimmed[index - 1];
        if (before === '/')
            continue;
        let i = index + 1;
        while (i < trimmed.length && /\s/.test(trimmed[i])) {
            i++;
        }
        const rest = trimmed.slice(i);
        const literal = parseNumericLiteralValue(rest.split(/\s|\)|\}|\]/)[0]);
        if (literal && literal.value === 0) {
            throw new Error('division by zero');
        }
    }
}
function inferLiteralKind(expr) {
    const trimmed = expr.trim();
    if (trimmed === 'true' || trimmed === 'false')
        return 'Bool';
    if (/^-?\d+(U8|U16|U32|U64|USize|I8|I16|I32|I64)?$/.test(trimmed))
        return 'Numeric';
    return undefined;
}
function getDeclaredTypeInfo(typeAnnotation, context) {
    if (!typeAnnotation)
        return { kind: 'Unknown' };
    const resolved = context ? resolveTypeAliasBaseType(typeAnnotation.trim(), context) || typeAnnotation.trim() : typeAnnotation.trim();
    if (resolved === 'Bool')
        return { kind: 'Bool' };
    const numericMatch = resolved.match(/^(U8|U16|U32|U64|USize|I8|I16|I32|I64)$/);
    if (numericMatch)
        return { kind: 'Numeric', numericSuffix: numericMatch[1] };
    return { kind: 'Unknown' };
}
function getNumericSuffixInfo(suffix) {
    switch (suffix) {
        case 'U8':
            return { width: 8, signed: false };
        case 'U16':
            return { width: 16, signed: false };
        case 'U32':
            return { width: 32, signed: false };
        case 'U64':
            return { width: 64, signed: false };
        case 'USize':
            return { width: 64, signed: false };
        case 'I8':
            return { width: 8, signed: true };
        case 'I16':
            return { width: 16, signed: true };
        case 'I32':
            return { width: 32, signed: true };
        case 'I64':
            return { width: 64, signed: true };
        default:
            return { width: 0, signed: true };
    }
}
function isNumericSuffixWider(exprSuffix, targetSuffix) {
    const exprInfo = getNumericSuffixInfo(exprSuffix);
    const targetInfo = getNumericSuffixInfo(targetSuffix);
    if (exprInfo.signed !== targetInfo.signed) {
        return true;
    }
    return exprInfo.width > targetInfo.width;
}
function parseIfExpression(expr) {
    const trimmed = expr.trim();
    if (!isIfKeyword(trimmed, 0))
        return undefined;
    const parenStart = trimmed.indexOf('(', 0);
    if (parenStart === -1)
        return undefined;
    const parenEnd = findMatchingClosingParen(trimmed, parenStart);
    if (parenEnd === -1)
        return undefined;
    const elseIndex = findMatchingElse(trimmed, 0, parenEnd);
    if (elseIndex === -1) {
        const fallbackMatch = trimmed.match(/^if\s*\((.+)\)\s*(.+?)\s+else\s+(.+)$/);
        if (!fallbackMatch)
            return undefined;
        return {
            condition: fallbackMatch[1].trim(),
            trueBranch: fallbackMatch[2].trim(),
            falseBranch: fallbackMatch[3].trim(),
        };
    }
    const condition = trimmed.slice(parenStart + 1, parenEnd).trim();
    let branchStart = parenEnd + 1;
    while (branchStart < trimmed.length && /\s/.test(trimmed[branchStart])) {
        branchStart++;
    }
    const trueBranch = trimmed.slice(branchStart, elseIndex).trim();
    let falseStart = elseIndex + 4;
    while (falseStart < trimmed.length && /\s/.test(trimmed[falseStart])) {
        falseStart++;
    }
    const falseBranch = trimmed.slice(falseStart).trim();
    return { condition, trueBranch, falseBranch };
}
function inferExprInfo(expr, varTypes, varNumericSuffixes) {
    const trimmed = expr.trim();
    if (!trimmed)
        return { kind: 'Unknown', numericSuffixes: [] };
    const simpleIfMatch = trimmed.match(/^if\s*\((.+)\)\s*(.+?)\s+else\s+(.+)$/);
    if (simpleIfMatch) {
        const conditionExpr = simpleIfMatch[1].trim();
        if (detectExprTypeSimple(conditionExpr, varTypes) !== 'Bool') {
            throw new Error('if condition must be boolean');
        }
        const trueBranch = simpleIfMatch[2];
        const falseBranch = simpleIfMatch[3];
        const trueKind = inferLiteralKind(trueBranch);
        const falseKind = inferLiteralKind(falseBranch);
        if (trueKind && falseKind && trueKind !== falseKind) {
            throw new Error('if branches must match types');
        }
        if (trueKind && falseKind) {
            const suffixes = [];
            if (trueKind === 'Numeric') {
                const trueSuffix = parseNumericLiteralSuffix(trueBranch);
                const falseSuffix = parseNumericLiteralSuffix(falseBranch);
                if (trueSuffix)
                    suffixes.push(trueSuffix);
                if (falseSuffix)
                    suffixes.push(falseSuffix);
            }
            return { kind: trueKind, numericSuffixes: suffixes };
        }
    }
    const ifParts = parseIfExpression(trimmed);
    if (ifParts) {
        if (detectExprTypeSimple(ifParts.condition, varTypes) !== 'Bool') {
            throw new Error('if condition must be boolean');
        }
        const trueInfo = inferExprInfo(ifParts.trueBranch, varTypes, varNumericSuffixes);
        const falseInfo = inferExprInfo(ifParts.falseBranch, varTypes, varNumericSuffixes);
        if (trueInfo.kind !== 'Unknown' && falseInfo.kind !== 'Unknown' && trueInfo.kind !== falseInfo.kind) {
            throw new Error('if branches must match types');
        }
        const resolvedKind = trueInfo.kind !== 'Unknown' ? trueInfo.kind : falseInfo.kind;
        if (resolvedKind === 'Bool') {
            return { kind: 'Bool', numericSuffixes: [] };
        }
        const combined = trueInfo.numericSuffixes.concat(falseInfo.numericSuffixes);
        return { kind: resolvedKind, numericSuffixes: combined };
    }
    if (/\btrue\b|\bfalse\b/.test(trimmed)) {
        return { kind: 'Bool', numericSuffixes: [] };
    }
    if (/==|!=|<|>|<=|>=|&&|\|\||!/.test(trimmed)) {
        return { kind: 'Bool', numericSuffixes: [] };
    }
    const literalSuffix = parseNumericLiteralSuffix(trimmed);
    if (literalSuffix) {
        return { kind: 'Numeric', numericSuffixes: [literalSuffix] };
    }
    const identMatch = trimmed.match(/^\w+$/);
    if (identMatch) {
        const varType = varTypes.get(trimmed) || 'Unknown';
        if (varType === 'Numeric') {
            const suffix = varNumericSuffixes.get(trimmed);
            return { kind: 'Numeric', numericSuffixes: suffix ? [suffix] : [] };
        }
        return { kind: varType, numericSuffixes: [] };
    }
    return { kind: 'Numeric', numericSuffixes: [] };
}
function ensureNoBoolArithmetic(expr, varTypes) {
    if (!/[+\-*/]/.test(expr))
        return;
    // Strip out if conditions and boolean branch contexts before checking
    // to avoid false positives for `if (true) 2 + 3`
    let sanitized = expr;
    // Remove if conditions: if (...) - just the condition part
    sanitized = sanitized.replace(/\bif\s*\([^)]*\)/g, 'if ()');
    // Remove else keyword
    sanitized = sanitized.replace(/\belse\b/g, '');
    // Remove while conditions
    sanitized = sanitized.replace(/\bwhile\s*\([^)]*\)/g, 'while ()');
    if (/\btrue\b|\bfalse\b/.test(sanitized)) {
        throw new Error('cannot perform arithmetic on booleans');
    }
    const identifiers = sanitized.match(/\b[a-zA-Z_]\w*\b/g) || [];
    for (const id of identifiers) {
        if (RESERVED_KEYWORDS.has(id))
            continue;
        if (varTypes.get(id) === 'Bool') {
            throw new Error('cannot perform arithmetic on booleans');
        }
    }
}
function splitStatements(source) {
    return splitTopLevel(source, ';');
}
function ensureWhileConditionBool(condition, varTypes) {
    if (detectExprTypeSimple(condition, varTypes) !== 'Bool') {
        throw new Error('while condition must be boolean');
    }
}
function buildWhileLoop(condition, body) {
    if (body.startsWith('{')) {
        let braceDepth = 0;
        let endIndex = -1;
        for (let j = 0; j < body.length; j++) {
            if (body[j] === '{')
                braceDepth++;
            if (body[j] === '}')
                braceDepth--;
            if (braceDepth === 0) {
                endIndex = j;
                break;
            }
        }
        const blockBody = endIndex >= 0 ? body.slice(0, endIndex + 1) : body;
        const trailing = endIndex >= 0 ? body.slice(endIndex + 1).trim() : '';
        return { loopCode: 'while (' + condition + ') ' + blockBody + ' ', trailing };
    }
    return { loopCode: 'while (' + condition + ') { ' + body + '; } ', trailing: '' };
}
function validateAssignment(varName, operator, valueOriginal, mutableVars, definedVars, varTypes, varNumericSuffixes, varInitialized) {
    if (!definedVars.has(varName)) {
        throw new Error('undefined variable');
    }
    const isMutable = mutableVars.has(varName);
    const wasInitialized = varInitialized.get(varName) !== false;
    if (!isMutable) {
        if (operator !== '=' || wasInitialized) {
            throw new Error('cannot assign to immutable variable');
        }
    }
    checkUndefinedVars(valueOriginal, definedVars);
    if (operator !== '=') {
        const varType = varTypes.get(varName);
        const valueType = detectExprTypeSimple(valueOriginal, varTypes);
        if (varType === 'Bool' || valueType === 'Bool') {
            throw new Error('cannot perform arithmetic on booleans');
        }
    }
    else {
        ensureNoBoolArithmetic(valueOriginal, varTypes);
        const exprInfo = inferExprInfo(valueOriginal, varTypes, varNumericSuffixes);
        const varType = varTypes.get(varName) || 'Unknown';
        if (varType === 'Bool' && exprInfo.kind === 'Numeric') {
            throw new Error('cannot convert numeric type to Bool');
        }
        if (varType === 'Numeric' && exprInfo.kind === 'Bool') {
            throw new Error('cannot convert Bool to numeric type');
        }
        const declaredSuffix = varNumericSuffixes.get(varName);
        if (declaredSuffix) {
            for (const suffix of exprInfo.numericSuffixes) {
                if (isNumericSuffixWider(suffix, declaredSuffix)) {
                    throw new Error('cannot convert numeric type to smaller width');
                }
            }
        }
    }
    if (operator === '=') {
        varInitialized.set(varName, true);
    }
}
function parseStructDeclaration(stmt) {
    const match = stmt.match(/^struct\s+(\w+)(<[^>]+>)?\s*\{([\s\S]*)\}$/);
    if (!match)
        return null;
    const name = match[1];
    const fieldsRaw = match[3].trim();
    if (!fieldsRaw) {
        return { name, fields: [] };
    }
    const fieldParts = splitTopLevel(fieldsRaw, ';').filter((part) => part.trim());
    const fields = [];
    const seen = new Set();
    for (const part of fieldParts) {
        const fieldMatch = part.trim().match(/^([a-zA-Z_]\w*)\s*:\s*([^;]+)$/);
        if (!fieldMatch) {
            throw new Error('invalid struct field: ' + part.trim());
        }
        const fieldName = fieldMatch[1];
        if (seen.has(fieldName)) {
            throw new Error('duplicate struct field: ' + fieldName);
        }
        seen.add(fieldName);
        fields.push(fieldName);
    }
    return { name, fields };
}
function registerStructDeclaration(decl, context) {
    const { structDefs } = context;
    if (structDefs.has(decl.name)) {
        throw new Error('struct already defined: ' + decl.name);
    }
    structDefs.set(decl.name, decl.fields);
    if (currentStructNames) {
        currentStructNames.add(decl.name);
    }
}
function resolveBaseTypeFromAnnotation(typeAnnotation, context) {
    if (!typeAnnotation)
        return undefined;
    const parsed = parseTypeConstraint(typeAnnotation);
    return resolveTypeAliasBaseType(parsed.baseType, context);
}
function parseStructTypeName(typeAnnotation, context) {
    const resolvedBase = resolveBaseTypeFromAnnotation(typeAnnotation, context);
    if (!resolvedBase)
        return undefined;
    const match = resolvedBase.match(/^([a-zA-Z_]\w*)(?:<[^>]+>)?$/);
    return match ? match[1] : undefined;
}
function parseStructLiteralExpression(expr, context) {
    const trimmed = expr.trim();
    const match = trimmed.match(/^([a-zA-Z_]\w*)(<[^>]+>)?\s*\{([\s\S]*)\}$/);
    if (!match)
        return null;
    const name = match[1];
    const structFields = context.structDefs.get(name);
    if (!structFields) {
        throw new Error('struct not defined: ' + name);
    }
    const content = match[3].trim();
    let values = [];
    if (content) {
        values = splitTopLevel(content, ';').filter((part) => part.trim());
        if (values.length === 1 && content.includes(',')) {
            values = splitTopLevel(content, ',').filter((part) => part.trim());
        }
    }
    if (values.length !== structFields.length) {
        throw new Error('struct literal has wrong field count');
    }
    return { name, values };
}
function convertStructLiteralExpression(expr, context) {
    const literal = parseStructLiteralExpression(expr, context);
    if (!literal) {
        return { converted: expr };
    }
    const fields = context.structDefs.get(literal.name) || [];
    const values = literal.values.map((value) => normalizeRefs(convertIfElseToTernary(value)));
    const entries = fields.map((field, index) => field + ': ' + values[index]);
    return { converted: '{ ' + entries.join(', ') + ' }', structName: literal.name };
}
function validateStructFieldAccess(expr, context) {
    const { structVarTypes, structDefs } = context;
    const matchIter = expr.match(/\b([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)\b/g);
    if (!matchIter)
        return;
    for (const match of matchIter) {
        const parts = match.split('.').map((part) => part.trim());
        const base = parts[0];
        const field = parts[1];
        if (base === 'this')
            continue;
        const structName = structVarTypes.get(base);
        if (!structName)
            continue;
        const fields = structDefs.get(structName) || [];
        if (!fields.includes(field)) {
            throw new Error('struct field does not exist: ' + field);
        }
    }
}
function scanTopLevel(text, matcher) {
    const matches = [];
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' && text[i - 1] !== '\\') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === '(')
            parenDepth++;
        if (ch === ')')
            parenDepth--;
        if (ch === '[')
            bracketDepth++;
        if (ch === ']')
            bracketDepth--;
        if (ch === '{')
            braceDepth++;
        if (ch === '}')
            braceDepth--;
        if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0)
            continue;
        const result = matcher(text, i);
        if (result) {
            matches.push({ pattern: result.matched, index: i });
            i += result.skip;
        }
    }
    return matches;
}
function validateComparisonTypes(expr, context) {
    const trimmed = expr.trim();
    if (!trimmed)
        return;
    // First split on && and || at top level, then validate each part
    const boolOpMatches = scanTopLevel(trimmed, (text, i) => {
        const twoChar = text.slice(i, i + 2);
        if (twoChar === '&&' || twoChar === '||')
            return { matched: twoChar, skip: 1 };
        return null;
    });
    if (boolOpMatches.length > 0) {
        const boolParts = [];
        let lastIndex = 0;
        for (const m of boolOpMatches) {
            boolParts.push(trimmed.slice(lastIndex, m.index).trim());
            lastIndex = m.index + m.pattern.length;
        }
        boolParts.push(trimmed.slice(lastIndex).trim());
        for (const part of boolParts) {
            validateComparisonTypes(part, context);
        }
        return;
    }
    const comparisonMatches = scanTopLevel(trimmed, (text, i) => {
        const twoChar = text.slice(i, i + 2);
        if (twoChar === '==' || twoChar === '!=' || twoChar === '<=' || twoChar === '>=') {
            return { matched: twoChar, skip: 1 };
        }
        const ch = text[i];
        if (ch === '<' || ch === '>')
            return { matched: ch, skip: 0 };
        return null;
    });
    if (!comparisonMatches.length)
        return;
    const parts = [];
    let lastIndex = 0;
    for (const op of comparisonMatches) {
        parts.push(trimmed.slice(lastIndex, op.index));
        lastIndex = op.index + op.pattern.length;
    }
    parts.push(trimmed.slice(lastIndex));
    const getOperandKind = (segment) => {
        const literalKind = inferLiteralKind(segment);
        if (literalKind)
            return literalKind;
        return inferExprInfo(segment, context.varTypes, context.varNumericSuffixes).kind;
    };
    for (let i = 0; i < comparisonMatches.length; i++) {
        const left = parts[i];
        const right = parts[i + 1];
        const leftKind = getOperandKind(left);
        const rightKind = getOperandKind(right);
        if (leftKind === 'Unknown' || rightKind === 'Unknown') {
            continue;
        }
        if (comparisonMatches[i].pattern === '<' ||
            comparisonMatches[i].pattern === '<=' ||
            comparisonMatches[i].pattern === '>' ||
            comparisonMatches[i].pattern === '>=') {
            if (leftKind !== 'Numeric' || rightKind !== 'Numeric') {
                throw new Error('cannot compare different types');
            }
        }
        else if (leftKind !== rightKind) {
            throw new Error('cannot compare different types');
        }
    }
}
function parseTypeAliasDeclaration(stmt) {
    const match = stmt.match(/^type\s+([a-zA-Z_]\w*)(?:\s*<[^>]+>)?\s*=\s*(.+?)(?:\s+then\s+([a-zA-Z_]\w*))?$/);
    if (!match)
        return null;
    return { name: match[1], baseType: match[2].trim(), dropFn: match[3] };
}
function registerTypeAliasDeclaration(info, context) {
    if (context.typeAliases.has(info.name)) {
        throw new Error('type alias already defined: ' + info.name);
    }
    context.typeAliases.set(info.name, { baseType: info.baseType, dropFn: info.dropFn });
    if (currentTypeAliasNames) {
        currentTypeAliasNames.add(info.name);
    }
}
function resolveTypeAliasEntry(typeName, context, seen = new Set()) {
    if (!typeName)
        return undefined;
    const trimmed = typeName.trim();
    if (!/^[a-zA-Z_]\w*$/.test(trimmed))
        return undefined;
    if (!context.typeAliases.has(trimmed))
        return undefined;
    if (seen.has(trimmed)) {
        throw new Error('cyclic type alias: ' + trimmed);
    }
    seen.add(trimmed);
    const alias = context.typeAliases.get(trimmed);
    if (!alias)
        return undefined;
    return { name: trimmed, alias };
}
function resolveTypeAliasBaseType(typeName, context, seen) {
    if (!typeName)
        return undefined;
    const entry = resolveTypeAliasEntry(typeName, context, seen || new Set());
    if (!entry)
        return typeName;
    const resolved = resolveTypeAliasBaseType(entry.alias.baseType, context, seen);
    return resolved || entry.alias.baseType;
}
function preRegisterTypeAliases(stmts, context) {
    for (const stmt of stmts) {
        const alias = parseTypeAliasDeclaration(stmt);
        if (!alias)
            continue;
        registerTypeAliasDeclaration(alias, context);
    }
}
function resolveTypeAliasDropFn(typeName, context, seen) {
    // Strip generic parameters if present (e.g., "Alloc<I32>" -> "Alloc")
    const baseName = typeName ? typeName.replace(/<[^>]+>/, '').trim() : undefined;
    if (!baseName)
        return undefined;
    const entry = resolveTypeAliasEntry(baseName, context, seen || new Set());
    if (!entry)
        return undefined;
    if (entry.alias.dropFn)
        return entry.alias.dropFn;
    return resolveTypeAliasDropFn(entry.alias.baseType, context, seen);
}
function buildDropCalls(context) {
    const calls = [];
    for (const [varName, dropFn] of context.varDropFns) {
        if (context.varInitialized.get(varName)) {
            calls.push('if (typeof ' + dropFn + " === 'function') { " + dropFn + '(' + varName + '); }');
        }
    }
    if (!calls.length)
        return '';
    return calls.join(' ');
}
function buildInvalidFunctionDefinitionError(definition) {
    return new Error('Invalid function definition: "' +
        definition.substring(0, 50) +
        (definition.length > 50 ? '...' : '') +
        '". Function definitions must follow the pattern: fn name(params) => body or fn name(params) : ReturnType => body');
}
function isNumericTypeName(typeName) {
    return /^(U8|U16|U32|U64|USize|I8|I16|I32|I64)$/.test(typeName);
}
function inferStructFieldKinds(structName, values, context) {
    const fields = context.structDefs.get(structName) || [];
    const kinds = new Map();
    for (let i = 0; i < fields.length; i++) {
        const valueInfo = inferExprInfo(values[i], context.varTypes, context.varNumericSuffixes);
        kinds.set(fields[i], valueInfo.kind);
    }
    return kinds;
}
function inferOperandKindForIs(expr, context) {
    const trimmed = expr.trim();
    if (/^true|false$/.test(trimmed))
        return 'Bool';
    if (/^-?\d+(U8|U16|U32|U64|USize|I8|I16|I32|I64)?$/.test(trimmed))
        return 'Numeric';
    const fieldMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)$/);
    if (fieldMatch) {
        const base = fieldMatch[1];
        const field = fieldMatch[2];
        const fieldKinds = context.structVarFieldKinds.get(base);
        if (fieldKinds && fieldKinds.has(field)) {
            return fieldKinds.get(field);
        }
    }
    const varType = context.varTypes.get(trimmed);
    if (varType)
        return varType;
    return 'Unknown';
}
function convertIsExpressions(expr, context) {
    return expr.replace(/\b([a-zA-Z_]\w*(?:\s*\.\s*[a-zA-Z_]\w*)?)\s+is\s+([a-zA-Z_]\w*)/g, (_match, left, typeName) => {
        const kind = inferOperandKindForIs(left, context);
        const resolvedType = resolveTypeAliasBaseType(typeName, context) || typeName;
        if (resolvedType === 'Bool') {
            return kind === 'Bool' ? '1' : '0';
        }
        if (isNumericTypeName(resolvedType)) {
            return kind === 'Numeric' ? '1' : '0';
        }
        return '0';
    });
}
function replaceInlineBlocks(code) {
    // For now, disable this while we debug the infinite loop issue
    return code;
}
/**
 * Convert block content to an arrow function IIFE.
 * Extracts statements and wraps the final expression in a return.
 */
function convertBlockToIIFE(blockContent, typeAliases) {
    if (!blockContent.trim()) {
        return '() => { return 0; }';
    }
    const stmts = splitBlockStatements(blockContent);
    if (stmts.length === 0) {
        return '() => { return 0; }';
    }
    // Track variables with drop functions
    const blockDropFns = new Map();
    if (typeAliases) {
        for (const stmt of stmts) {
            const letWithType = stmt.trim().match(/^let\s+(mut\s+)?(\w+)\s*:\s*([^=]+?)(?:\s*=|$)/);
            if (letWithType) {
                const varName = letWithType[2];
                const typePart = letWithType[3].trim();
                // Strip generic parameters for type alias lookup
                const baseTypeName = typePart.replace(/<[^>]+>/g, '');
                const alias = typeAliases.get(baseTypeName);
                if (alias && alias.dropFn) {
                    blockDropFns.set(varName, alias.dropFn);
                }
            }
        }
    }
    const bodyStatements = stmts.slice(0, -1);
    // All but the last are statements - convert Tuff syntax to JS
    let body = bodyStatements
        .map((stmt) => {
        return convertBlockStatementToJs(stmt, typeAliases);
    })
        .join('; ');
    const lastExpr = stmts[stmts.length - 1];
    const lastIsStatement = isNonValueStatement(lastExpr);
    const scopeParts = collectThisObjectParts(bodyStatements, (init) => normalizeRefs(convertIfElseToTernary(init)), (params) => parseFnParams(params), true, (stmt) => convertBlockStatementToJs(stmt, typeAliases), (kind, name) => {
        if (kind === 'var') {
            return 'get ' + name + '() { return ' + name + '; }, set ' + name + '(newValue) { ' + name + ' = newValue; }';
        }
        return name + ': ' + name;
    }, typeAliases);
    const scopeMembers = scopeParts.members.join(', ');
    const thisScopeDecl = 'const __thisValue = { this: (typeof __thisParent !== "undefined" ? (__thisParent.__thisValue || __thisParent) : undefined)' +
        (scopeMembers ? ', ' + scopeMembers : '') +
        ' };';
    const thisScopeAssign = ' if (typeof __thisScope !== "undefined") __thisScope.__thisValue = __thisValue;';
    if (lastExpr.trim() === 'this' && !lastIsStatement) {
        let body = scopeParts.locals.join(' ');
        // Clean up variables with drop functions before returning
        if (blockDropFns.size > 0) {
            for (const [varName, dropFn] of blockDropFns.entries()) {
                body = body + ' if (typeof ' + dropFn + ' === "function") { ' + dropFn + '(' + varName + '); }';
            }
        }
        return '() => { ' + body + ' ' + thisScopeDecl + thisScopeAssign + ' return __thisValue; }';
    }
    const finalExpr = lastIsStatement ? '0' : convertInlineBlockExpressions(normalizeRefs(convertIfElseToTernary(lastExpr)), typeAliases);
    if (body) {
        body = body + '; ';
    }
    if (lastIsStatement) {
        body = body + convertBlockStatementToJs(lastExpr, typeAliases) + '; ';
    }
    if (scopeMembers) {
        body = body + thisScopeDecl + thisScopeAssign + ' ';
    }
    // Clean up variables with drop functions before returning
    if (blockDropFns.size > 0) {
        for (const [varName, dropFn] of blockDropFns.entries()) {
            body = body + 'if (typeof ' + dropFn + ' === "function") { ' + dropFn + '(' + varName + '); } ';
        }
    }
    return '() => { ' + body + 'return ' + finalExpr + '; }';
}
function splitBlockStatements(blockContent) {
    const parts = splitTopLevel(blockContent, ';');
    const statements = [];
    for (const part of parts) {
        let trimmed = part.trim();
        if (!trimmed)
            continue;
        while (trimmed) {
            const leadingFn = splitLeadingFunctionDefinition(trimmed);
            if (!leadingFn) {
                break;
            }
            statements.push(leadingFn.definition.trim());
            trimmed = leadingFn.trailing.trim();
        }
        if (trimmed) {
            statements.push(trimmed);
        }
    }
    if (statements.length > 1) {
        return statements;
    }
    const trimmed = blockContent.trim();
    if (!trimmed)
        return [];
    return splitTopLevel(trimmed, '\n')
        .map((part) => part.trim())
        .filter((part) => part);
}
function isNonValueStatement(stmt) {
    const trimmed = stmt.trim();
    if (!trimmed)
        return true;
    if (trimmed.startsWith('fn '))
        return true;
    if (trimmed.startsWith('let '))
        return true;
    if (trimmed.startsWith('while '))
        return true;
    return /^\w+\s*(\+=|-=|\*=|\/=|=(?!=))/.test(trimmed);
}
function convertBlockStatementToJs(stmt, typeAliases) {
    const trimmed = stmt.trim();
    if (!trimmed)
        return '';
    if (trimmed.startsWith('fn ')) {
        const fnDef = parseFunctionDefinitionForCompile(trimmed);
        if (!fnDef)
            return '';
        const parsedParams = parseFnParams(fnDef.params);
        return buildFunctionDefinition(fnDef.name, parsedParams, fnDef.body, typeAliases);
    }
    const letWithInit = trimmed.match(/^let\s+(mut\s+)?(\w+)\s*:\s*[^=]+\s*=\s*(.+)$/);
    if (letWithInit) {
        const name = letWithInit[2];
        const init = letWithInit[3];
        return 'let ' + name + ' = ' + normalizeRefs(convertIfElseToTernary(init)) + ';';
    }
    const letNoInit = trimmed.match(/^let\s+(mut\s+)?(\w+)\s*:\s*.+$/);
    if (letNoInit) {
        const name = letNoInit[2];
        return 'let ' + name;
    }
    return normalizeRefs(convertIfElseToTernary(trimmed)).replace(/^let\s+mut\s+/g, 'let ');
}
function parseFunctionDefinitionForCompile(stmt) {
    const trimmed = stmt.trim();
    if (!trimmed.startsWith('fn '))
        return null;
    const depths = { paren: 0, bracket: 0, brace: 0 };
    let arrowIndex = -1;
    for (let i = 0; i < trimmed.length - 1; i++) {
        const ch = trimmed[i];
        updateDepthCounters(ch, depths);
        if (!isAtTopLevel(depths)) {
            continue;
        }
        if (trimmed[i] === '=' && trimmed[i + 1] === '>') {
            arrowIndex = i;
        }
    }
    if (arrowIndex === -1)
        return null;
    const header = trimmed.slice(0, arrowIndex).trim();
    const body = trimmed.slice(arrowIndex + 2).trim();
    const headerMatch = header.match(/^fn\s+(\w+)\s*(<\s*[^>]+\s*>)?\s*\(([^)]*)\)\s*(?::\s*(.+))?$/);
    if (!headerMatch)
        return null;
    return {
        name: headerMatch[1],
        params: headerMatch[3].trim(),
        returnType: headerMatch[4] ? headerMatch[4].trim() : undefined,
        body: body,
    };
}
function updateDepthCounters(ch, depths) {
    const deltas = {
        '(': ['paren', 1],
        ')': ['paren', -1],
        '[': ['bracket', 1],
        ']': ['bracket', -1],
        '{': ['brace', 1],
        '}': ['brace', -1],
    };
    const entry = deltas[ch];
    if (!entry)
        return;
    depths[entry[0]] += entry[1];
}
function isAtTopLevel(depths) {
    return depths.paren === 0 && depths.bracket === 0 && depths.brace === 0;
}
function parseLetStatementForCompile(stmt) {
    const trimmed = stmt.trim();
    if (!trimmed.startsWith('let '))
        return null;
    let rest = trimmed.slice(4).trim();
    let isMutable = false;
    if (rest.startsWith('mut ')) {
        isMutable = true;
        rest = rest.slice(4).trim();
    }
    const nameMatch = rest.match(/^([a-zA-Z_]\w*)/);
    if (!nameMatch)
        return null;
    const varName = nameMatch[1];
    rest = rest.slice(nameMatch[0].length).trim();
    if (!rest)
        return { isMutable, varName };
    if (rest.startsWith('=')) {
        return { isMutable, varName, expr: rest.slice(1).trim() };
    }
    if (!rest.startsWith(':'))
        return null;
    let typePart = rest.slice(1).trim();
    let expr;
    const depths = { paren: 0, bracket: 0, brace: 0 };
    for (let i = 0; i < typePart.length; i++) {
        const ch = typePart[i];
        updateDepthCounters(ch, depths);
        if (isAtTopLevel(depths) && ch === '=') {
            if (typePart[i + 1] === '>') {
                continue;
            }
            expr = typePart.slice(i + 1).trim();
            typePart = typePart.slice(0, i).trim();
            break;
        }
    }
    return { isMutable, varName, typeAnnotation: typePart || undefined, expr };
}
function collectThisObjectParts(statements, convertValue, parseParams, allowOtherStatements, convertStatement, buildMember, typeAliases) {
    const locals = [];
    const members = [];
    for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed)
            continue;
        if (trimmed.startsWith('fn ')) {
            const fnDef = parseFunctionDefinitionForCompile(trimmed);
            if (!fnDef) {
                throw new Error('invalid function definition');
            }
            const parsedParams = parseParams(fnDef.params);
            locals.push(buildFunctionDefinition(fnDef.name, parsedParams, fnDef.body, typeAliases));
            members.push(buildMember('fn', fnDef.name));
            continue;
        }
        const letWithInit = trimmed.match(/^let\s+(mut\s+)?(\w+)\s*(?::\s*[^=]+)?\s*=\s*(.+)$/);
        if (letWithInit) {
            const varName = letWithInit[2];
            const init = letWithInit[3];
            locals.push('let ' + varName + ' = ' + convertValue(init) + ';');
            members.push(buildMember('var', varName));
            continue;
        }
        const letNoInit = trimmed.match(/^let\s+(mut\s+)?(\w+)(?:\s*:\s*.+)?$/);
        if (letNoInit) {
            const varName = letNoInit[2];
            locals.push('let ' + varName + ' = 0;');
            members.push(buildMember('var', varName));
            continue;
        }
        if (!allowOtherStatements) {
            throw new Error('invalid object declaration');
        }
        locals.push(convertStatement(trimmed) + ';');
    }
    return { locals, members };
}
function emitFunctionDefinition(fnDef, fnDefOriginal, context, fnArrayParamRequirements) {
    const params = fnDefOriginal.params.trim();
    const bodyOriginal = fnDefOriginal.body.trim();
    const returnType = fnDefOriginal.returnType;
    const parsedParams = parseFnParams(params, context);
    for (const param of parsedParams) {
        if (param.arrayInfo) {
            registerFnArrayParam(fnArrayParamRequirements, fnDefOriginal.name, param.index, param.arrayInfo);
        }
    }
    registerFunctionSignature(fnDefOriginal.name, parsedParams, returnType, bodyOriginal, context);
    const thisMembers = inferThisMembersFromBody(bodyOriginal, context);
    if (thisMembers) {
        context.thisMemberSets.set(fnDefOriginal.name, thisMembers);
    }
    return buildFunctionDefinition(fnDefOriginal.name, parsedParams, fnDef.body.trim(), context.typeAliases);
}
function buildFunctionDefinition(name, parsedParams, body, typeAliases) {
    const jsParams = parsedParams.map((param) => (param.name === 'this' ? '_this' : param.name)).join(', ');
    let bodyExpr = compileFunctionBodyExpression(body, typeAliases);
    const paramMembers = parsedParams
        .filter((param) => param.name !== 'this')
        .map((param) => param.name + ': ' + param.name)
        .join(', ');
    if (paramMembers && bodyExpr.includes('const __this = {')) {
        bodyExpr = bodyExpr.replace('const __this = {', 'const __this = { ' + paramMembers + ',');
    }
    if (paramMembers && bodyExpr.includes('const __thisValue = {')) {
        bodyExpr = bodyExpr.replace('const __thisValue = {', 'const __thisValue = { ' + paramMembers + ',');
    }
    if (paramMembers && bodyExpr.includes('const __thisScope = {')) {
        bodyExpr = bodyExpr.replace('const __thisScope = {', 'const __thisScope = { ' + paramMembers + ',');
    }
    const hasExplicitThis = parsedParams.some((param) => param.name === 'this');
    if (hasExplicitThis) {
        bodyExpr = bodyExpr.replace(/\bthis\b/g, '_this');
    }
    const pointerParams = parsedParams.filter((param) => param.isPointer);
    for (const param of pointerParams) {
        const jsParam = param.name === 'this' ? '_this' : param.name;
        const derefRegex = new RegExp('\\*\\s*' + jsParam + '\\b', 'g');
        bodyExpr = bodyExpr.replace(derefRegex, jsParam + '.value');
    }
    const usesThisProxy = !hasExplicitThis && /\bthis\b/.test(bodyExpr);
    if (usesThisProxy) {
        bodyExpr = applyOutsideFunctionDeclarations(bodyExpr, (segment) => {
            return segment.replace(/(^|[^.\w])this\b/g, (match, prefix, offset, full) => {
                const start = offset + prefix.length;
                let i = start + 4;
                while (i < full.length && /\s/.test(full[i])) {
                    i++;
                }
                if (full[i] === ':') {
                    return match;
                }
                return prefix + '__thisScope';
            });
        });
        bodyExpr = applyOutsideFunctionDeclarations(bodyExpr, bindCallsToThisScope);
        const thisPrelude = 'const __thisParent = this; ' +
            'const __thisScope = new Proxy({}, { ' +
            'get: function (_target, prop) { ' +
            'if (prop === "this") { return __thisParent && __thisParent.__thisValue ? __thisParent.__thisValue : __thisParent; } ' +
            'if (prop === "__thisValue") { return _target.__thisValue; } ' +
            'return eval(String(prop)); ' +
            '}, ' +
            'set: function (_target, prop, newValue) { ' +
            'if (prop === "__thisValue") { _target.__thisValue = newValue; return true; } ' +
            'eval(String(prop) + " = newValue"); ' +
            'return true; ' +
            '} ' +
            '}); ';
        return 'function ' + name + '(' + jsParams + ') { ' + thisPrelude + 'return ' + bodyExpr + '; }';
    }
    return 'function ' + name + '(' + jsParams + ') { return ' + bodyExpr + '; }';
}
function compileFunctionBodyExpression(body, typeAliases) {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
        const endIndex = findMatchingClosing(trimmed, 0, '{', '}');
        if (endIndex === -1) {
            throw new Error('unmatched opening brace');
        }
        const blockContent = trimmed.slice(1, endIndex).trim();
        const blockCode = convertBlockToIIFE(blockContent, typeAliases);
        return '(' + blockCode + ')()';
    }
    return normalizeRefs(convertIfElseToTernary(trimmed));
}
function findMatchingClosing(str, openIndex, openChar, closeChar) {
    let count = 1;
    for (let i = openIndex + 1; i < str.length; i++) {
        if (str[i] === openChar)
            count++;
        if (str[i] === closeChar)
            count--;
        if (count === 0)
            return i;
    }
    return -1;
}
let currentStructNames = null;
let currentTypeAliasNames = null;
function parseArrayType(typeAnnotation) {
    if (!typeAnnotation)
        return undefined;
    const stripped = stripPointerPrefix(typeAnnotation);
    let trimmed = stripped.base;
    const isPointer = stripped.isPointer;
    const fullMatch = trimmed.match(/^\[\s*([^;\]]+)\s*;\s*(\d+)\s*;\s*(\d+)\s*\]$/);
    if (fullMatch) {
        const elementKind = normalizeElementKind(fullMatch[1]);
        return {
            elementKind,
            initializedCount: parseInt(fullMatch[2], 10),
            length: parseInt(fullMatch[3], 10),
            isPointer,
        };
    }
    const sliceMatch = trimmed.match(/^\[\s*([^;\]]+)\s*\]$/);
    if (sliceMatch) {
        const elementKind = normalizeElementKind(sliceMatch[1]);
        return { elementKind, isPointer };
    }
    return undefined;
}
function parseArrayPointerReturnInfo(returnType) {
    if (!returnType)
        return { isArrayPointer: false, mutable: false };
    let trimmed = returnType.trim();
    if (!trimmed.startsWith('*')) {
        return { isArrayPointer: false, mutable: false };
    }
    trimmed = trimmed.slice(1).trim();
    let mutable = false;
    if (trimmed.startsWith('mut ')) {
        mutable = true;
        trimmed = trimmed.slice(4).trim();
    }
    const isArrayPointer = trimmed.startsWith('[');
    return { isArrayPointer, mutable };
}
function parseTypeConstraint(typeAnnotation) {
    if (!typeAnnotation)
        return { baseType: undefined };
    const match = typeAnnotation.match(/^(.+?)\s*(<=|>=|<|>)\s*(-?\d+.*)$/);
    if (!match) {
        return { baseType: typeAnnotation.trim() };
    }
    const baseType = match[1].trim();
    const operator = match[2];
    const limitLiteral = match[3].trim();
    const limitValue = parseNumericLiteralValue(limitLiteral);
    if (!limitValue) {
        throw new Error('invalid numeric constraint');
    }
    return { baseType, constraint: { operator, limit: limitValue.value } };
}
function validateNumericConstraint(valueOriginal, constraint) {
    if (!constraint)
        return;
    const literal = parseNumericLiteralValue(valueOriginal);
    if (!literal)
        return;
    const value = literal.value;
    switch (constraint.operator) {
        case '<':
            if (!(value < constraint.limit)) {
                throw new Error('numeric constraint violated');
            }
            break;
        case '<=':
            if (!(value <= constraint.limit)) {
                throw new Error('numeric constraint violated');
            }
            break;
        case '>':
            if (!(value > constraint.limit)) {
                throw new Error('numeric constraint violated');
            }
            break;
        case '>=':
            if (!(value >= constraint.limit)) {
                throw new Error('numeric constraint violated');
            }
            break;
    }
}
function normalizeElementKind(typeName) {
    const trimmed = typeName.trim();
    if (trimmed === 'Bool')
        return 'Bool';
    if (/^(U8|U16|U32|U64|USize|I8|I16|I32|I64)$/.test(trimmed))
        return 'Numeric';
    return 'Unknown';
}
function parseFnParams(params, context) {
    const trimmed = params.trim();
    if (!trimmed)
        return [];
    const parts = splitTopLevel(trimmed, ',');
    const result = [];
    const seen = new Set();
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part)
            continue;
        const match = part.match(/^(?:mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*(.+))?$/);
        if (!match)
            continue;
        const name = match[1];
        if (seen.has(name)) {
            throw new Error('duplicate parameter name: ' + name);
        }
        seen.add(name);
        const typeAnnotation = match[2] ? match[2].trim() : undefined;
        const resolvedType = context ? resolveTypeAliasBaseType(typeAnnotation, context) : typeAnnotation;
        const declaredInfo = getDeclaredTypeInfo(resolvedType, context);
        const kind = declaredInfo.kind;
        const arrayTypeInfo = parseArrayType(resolvedType);
        const pointerInfo = context ? parsePointerTypeAnnotation(typeAnnotation, context) : undefined;
        const isPointer = !!pointerInfo;
        const pointerMutable = pointerInfo ? pointerInfo.mutable : false;
        if (arrayTypeInfo && arrayTypeInfo.initializedCount !== undefined) {
            result.push({
                name,
                index: i,
                arrayInfo: { minInitialized: arrayTypeInfo.initializedCount },
                kind,
                isPointer,
                pointerMutable,
            });
        }
        else {
            result.push({ name, index: i, kind, isPointer, pointerMutable });
        }
    }
    return result;
}
function registerFnArrayParam(map, fnName, index, info) {
    const existing = map.get(fnName) || [];
    existing.push({ index, minInitialized: info.minInitialized });
    map.set(fnName, existing);
}
function parseArrayLiteral(expr) {
    const trimmed = expr.trim();
    if (!trimmed.startsWith('['))
        return undefined;
    const endIndex = findMatchingClosing(trimmed, 0, '[', ']');
    if (endIndex !== trimmed.length - 1)
        return undefined;
    const content = trimmed.slice(1, endIndex).trim();
    if (!content)
        return [];
    return splitTopLevel(content, ',');
}
function splitTopLevel(source, separator) {
    const parts = [];
    let current = '';
    let bracketDepth = 0;
    let parenDepth = 0;
    let braceDepth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (ch === stringChar && source[i - 1] !== '\\') {
                inString = false;
            }
            current += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            current += ch;
            continue;
        }
        if (ch === '[')
            bracketDepth++;
        if (ch === ']')
            bracketDepth--;
        if (ch === '(')
            parenDepth++;
        if (ch === ')')
            parenDepth--;
        if (ch === '{')
            braceDepth++;
        if (ch === '}')
            braceDepth--;
        if (ch === separator && bracketDepth === 0 && parenDepth === 0 && braceDepth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim())
        parts.push(current.trim());
    return parts;
}
function inferArrayLiteralElementKind(elements, varTypes, varNumericSuffixes) {
    for (const element of elements) {
        const kind = inferLiteralKind(element);
        if (kind) {
            return kind;
        }
        const info = inferExprInfo(element, varTypes, varNumericSuffixes);
        if (info.kind !== 'Unknown') {
            return info.kind;
        }
    }
    return 'Unknown';
}
function validateArrayLiteral(elements, arrayTypeInfo, original) {
    if (arrayTypeInfo.length !== undefined && elements.length > arrayTypeInfo.length) {
        throw new Error('array literal exceeds declared length');
    }
    if (arrayTypeInfo.initializedCount !== undefined && elements.length < arrayTypeInfo.initializedCount) {
        throw new Error('array literal has too few elements');
    }
    const elementKind = arrayTypeInfo.elementKind;
    if (elementKind === 'Unknown')
        return;
    for (const element of elements) {
        const literalKind = inferLiteralKind(element);
        if (literalKind && literalKind !== elementKind) {
            throw new Error('array literal element type mismatch');
        }
    }
    if (elementKind === 'Numeric' && /\btrue\b|\bfalse\b/.test(original)) {
        throw new Error('array literal element type mismatch');
    }
}
function parseAddressOfTarget(expr) {
    const match = expr.trim().match(/^&\s*(?:mut\s+)?([a-zA-Z_]\w*)$/);
    return match ? match[1] : undefined;
}
function normalizeRefs(expr) {
    let result = expr;
    result = result.replace(/&\s*mut\s+([a-zA-Z_]\w*)/g, '$1');
    result = result.replace(/&\s*([a-zA-Z_]\w*)/g, '$1');
    return result;
}
function convertThisAccess(expr) {
    return expr.replace(/\bthis\s*\.\s*([a-zA-Z_]\w*)/g, (_match, field) => field);
}
function convertInlineBlockExpressions(expr, typeAliases) {
    let result = '';
    let index = 0;
    while (index < expr.length) {
        const start = expr.indexOf('{', index);
        if (start === -1) {
            result += expr.slice(index);
            break;
        }
        const before = expr.slice(index, start);
        result += before;
        let prevIndex = start - 1;
        while (prevIndex >= 0 && /\s/.test(expr[prevIndex])) {
            prevIndex--;
        }
        const prevChar = prevIndex >= 0 ? expr[prevIndex] : '';
        const isStructLiteral = /[a-zA-Z0-9_>\]]/.test(prevChar);
        if (isStructLiteral) {
            result += '{';
            index = start + 1;
            continue;
        }
        const end = findMatchingClosing(expr, start, '{', '}');
        if (end === -1) {
            throw new Error('unmatched opening brace');
        }
        const blockContent = expr.slice(start + 1, end).trim();
        const blockCode = convertBlockToIIFE(blockContent, typeAliases);
        result += '(' + blockCode + ')()';
        index = end + 1;
    }
    return result;
}
function stripPointerPrefix(typeStr) {
    let trimmed = typeStr.trim();
    let isPointer = false;
    if (trimmed.startsWith('*')) {
        isPointer = true;
        trimmed = trimmed.slice(1).trim();
        if (trimmed.startsWith('mut ')) {
            trimmed = trimmed.slice(4).trim();
        }
    }
    return { base: trimmed, isPointer };
}
function parsePointerTypeAnnotation(typeAnnotation, context) {
    const resolvedBase = resolveBaseTypeFromAnnotation(typeAnnotation, context);
    if (!resolvedBase)
        return undefined;
    const trimmed = resolvedBase.trim();
    if (!trimmed.startsWith('*'))
        return undefined;
    const mutable = trimmed.startsWith('*mut ');
    const stripped = stripPointerPrefix(resolvedBase);
    if (stripped.base.includes('=>'))
        return undefined;
    const kindInfo = getDeclaredTypeInfo(stripped.base, context);
    return { kind: kindInfo.kind, mutable };
}
function isFunctionPointerType(typeAnnotation, context) {
    const resolvedBase = resolveBaseTypeFromAnnotation(typeAnnotation, context);
    if (!resolvedBase)
        return false;
    return resolvedBase.includes('=>');
}
function convertUnboundFunctionPointerAccess(expr) {
    return expr.replace(/\b([a-zA-Z_]\w*)::([a-zA-Z_]\w*)/g, (_match, _base, field) => {
        return 'function (ctx) { return ctx.' + field + '(); }';
    });
}
function parseMethodCallExpression(expr) {
    const methodCallExpr = expr.replace(/\s*\n\s*\./g, '.');
    const match = methodCallExpr.trim().match(/^([\s\S]+)\s*\.\s*([a-zA-Z_]\w*)\s*\(\s*(.*)\s*\)$/);
    if (!match)
        return undefined;
    const baseExpr = match[1].trim();
    if (!baseExpr)
        return undefined;
    const depths = { paren: 0, bracket: 0, brace: 0 };
    for (let i = 0; i < baseExpr.length; i++) {
        updateDepthCounters(baseExpr[i], depths);
    }
    if (!isAtTopLevel(depths))
        return undefined;
    return { baseExpr, fnName: match[2], argsStr: match[3] };
}
function isSimpleReceiver(expr) {
    const trimmed = expr.trim();
    if (/^[a-zA-Z_]\w*$/.test(trimmed))
        return true;
    return !!parseNumericLiteralValue(trimmed);
}
function buildPointerWrapper(varName) {
    return '({ get value() { return ' + varName + '; }, set value(v) { ' + varName + ' = v; } })';
}
function buildThisScopeObject(context) {
    const entries = [];
    for (const name of context.definedVars) {
        if (name === 'this')
            continue;
        entries.push('get ' + name + '() { return ' + name + '; }');
        if (context.mutableVars.has(name)) {
            entries.push('set ' + name + '(value) { ' + name + ' = value; }');
        }
    }
    return '{ ' + entries.join(', ') + ' }';
}
function bindCallsToThisScope(code) {
    const skip = new Set(['if', 'while', 'for', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'Proxy', 'eval']);
    const replaced = code.replace(/(^|[^.\w])([a-zA-Z_]\w*)\s*\(/g, (match, prefix, name, offset, full) => {
        const before = full.slice(0, offset);
        if (/\bfunction\s*$/.test(before) || /\bnew\s*$/.test(before)) {
            return match;
        }
        if (/\bget\s*$/.test(before) || /\bset\s*$/.test(before)) {
            return match;
        }
        if (skip.has(name)) {
            return match;
        }
        return prefix + name + '.call(__thisScope, ';
    });
    return replaced.replace(/\.call\(__thisScope,\s*\)/g, '.call(__thisScope)');
}
function applyOutsideFunctionDeclarations(code, transform) {
    let result = '';
    let index = 0;
    while (index < code.length) {
        const next = code.indexOf('function', index);
        if (next === -1) {
            result += transform(code.slice(index));
            break;
        }
        const before = code[next - 1];
        const after = code[next + 8];
        const isKeyword = (!before || /\W/.test(before)) && (!after || /\W/.test(after));
        if (!isKeyword) {
            result += transform(code.slice(index, next + 8));
            index = next + 8;
            continue;
        }
        result += transform(code.slice(index, next));
        const braceStart = code.indexOf('{', next);
        if (braceStart === -1) {
            result += code.slice(next);
            break;
        }
        const braceEnd = findMatchingClosing(code, braceStart, '{', '}');
        if (braceEnd === -1) {
            result += code.slice(next);
            break;
        }
        result += code.slice(next, braceEnd + 1);
        index = braceEnd + 1;
    }
    return result;
}
function validateExpressionForCompile(expr, context, disallowVoidCall) {
    const { arrayVars, arrayPointerTargets } = context;
    validateNumericLiteralOverflow(expr);
    validateDivisionByZero(expr);
    validatePointerDerefs(expr, context);
    validateStructFieldAccess(expr, context);
    const methodValidation = resolveMethodStyleCall(expr, context);
    validateFunctionCalls(methodValidation.converted, context, disallowVoidCall);
    validateComparisonTypes(expr, context);
    validateArrayAccesses(expr, arrayVars, arrayPointerTargets);
    validateArrayLiteralIndexing(expr);
    validateArrayCallRequirements(expr, context);
}
function buildThisFieldAssignment(varName, operator, value, valueOriginal, context) {
    return handleAssignment(varName, operator, value, valueOriginal, context);
}
function inferThisMembersFromBody(body, context) {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{'))
        return undefined;
    const endIndex = findMatchingClosing(trimmed, 0, '{', '}');
    if (endIndex === -1)
        return undefined;
    const blockContent = trimmed.slice(1, endIndex).trim();
    const stmts = splitBlockStatements(blockContent);
    if (stmts.length === 0)
        return undefined;
    const last = stmts[stmts.length - 1];
    if (last.trim() !== 'this' || isNonValueStatement(last))
        return undefined;
    const parts = collectThisObjectParts(stmts.slice(0, -1), (init) => normalizeRefs(convertIfElseToTernary(init)), (params) => parseFnParams(params, context), true, (stmt) => convertBlockStatementToJs(stmt, context.typeAliases), (_kind, name) => name + ': ' + name, context.typeAliases);
    const members = new Set();
    for (const entry of parts.members) {
        const match = entry.match(/^([a-zA-Z_]\w*)\s*:/);
        if (match) {
            members.add(match[1]);
        }
    }
    return members;
}
function resolveMethodStyleCall(expr, context) {
    const parsed = parseMethodCallExpression(expr);
    if (!parsed)
        return { converted: expr };
    const { baseExpr, fnName, argsStr } = parsed;
    if (baseExpr === 'this') {
        const signature = context.fnSignatures.get(fnName);
        if (!signature) {
            return { converted: expr };
        }
        const args = argsStr.trim() ? splitTopLevel(argsStr, ',') : [];
        if (args.length !== signature.paramKinds.length) {
            throw new Error('function ' + fnName + ' expects ' + signature.paramKinds.length + ' args');
        }
        return { converted: fnName + '(' + args.join(', ') + ')' };
    }
    const signature = context.fnSignatures.get(fnName);
    const args = argsStr.trim() ? splitTopLevel(argsStr, ',') : [];
    const simpleReceiver = isSimpleReceiver(baseExpr);
    if (!signature) {
        if (/^[a-zA-Z_]\w*$/.test(baseExpr)) {
            const members = context.thisValueMembers.get(baseExpr);
            if (members) {
                if (!members.has(fnName)) {
                    throw new Error('function not found: ' + fnName);
                }
                return { converted: expr };
            }
            // Check if receiver is a singleton with this method
            const singletonMethods = context.singletonMethods.get(baseExpr);
            if (singletonMethods) {
                if (!singletonMethods.has(fnName)) {
                    throw new Error('function not found: ' + fnName);
                }
                return { converted: expr };
            }
        }
        if (simpleReceiver) {
            throw new Error('function not found: ' + fnName);
        }
        return { converted: expr };
    }
    const expectsThis = signature.paramNames[0] === 'this';
    if (!expectsThis) {
        return { converted: expr };
    }
    const expectedArgs = signature.paramKinds.length - 1;
    if (args.length !== expectedArgs) {
        throw new Error('function ' + fnName + ' expects ' + expectedArgs + ' args');
    }
    let receiverExpr = baseExpr;
    if (signature.paramIsPointer[0]) {
        if (!/^[a-zA-Z_]\w*$/.test(baseExpr)) {
            throw new Error('cannot take reference to non-variable receiver');
        }
        if (signature.paramPointerMutables[0] && !context.mutableVars.has(baseExpr)) {
            throw new Error('cannot take mutable reference to immutable variable');
        }
        receiverExpr = buildPointerWrapper(baseExpr);
    }
    const mergedArgs = [receiverExpr].concat(args).join(', ');
    return { converted: fnName + '(' + mergedArgs + ')' };
}
function validatePointerDerefs(expr, context) {
    const regex = /\*\s*([a-zA-Z_]\w*)/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
        const name = match[1];
        if (!context.pointerTargets.has(name)) {
            throw new Error('cannot dereference non-pointer type');
        }
    }
}
function convertPointerDerefs(expr, context) {
    return expr.replace(/\*\s*([a-zA-Z_]\w*)/g, (_match, name) => {
        const target = context.pointerTargets.get(name);
        if (!target) {
            throw new Error('cannot dereference non-pointer type');
        }
        return target;
    });
}
function isStringLiteral(expr) {
    return /^"(?:\\.|[^"\\])*"$/.test(expr.trim());
}
function isStringTypeAnnotation(typeAnnotation, context) {
    if (!typeAnnotation)
        return false;
    const parsed = parseTypeConstraint(typeAnnotation);
    const resolvedBase = resolveTypeAliasBaseType(parsed.baseType, context);
    if (!resolvedBase)
        return false;
    const stripped = stripPointerPrefix(resolvedBase);
    return stripped.base === 'Str';
}
function convertStringIndexing(expr, context) {
    let result = expr;
    for (const name of context.stringVars) {
        const regex = new RegExp('\\b' + name + '\\s*\\[\\s*([^\\]]+)\\s*\\]', 'g');
        result = result.replace(regex, '(' + name + ').charCodeAt($1)');
    }
    return result;
}
function parseIndexLiteral(expr) {
    const trimmed = expr.trim();
    const match = trimmed.match(/^-?\d+(U8|U16|U32|U64|USize|I8|I16|I32|I64)?$/);
    if (!match)
        return undefined;
    const suffix = match[1];
    const numStr = suffix ? trimmed.slice(0, -suffix.length) : trimmed;
    return parseInt(numStr, 10);
}
function resolveArrayInfo(name, arrayVars, arrayPointerTargets) {
    const direct = arrayVars.get(name);
    if (direct) {
        return { info: direct, target: name };
    }
    const target = arrayPointerTargets.get(name);
    if (target) {
        const info = arrayVars.get(target);
        if (info)
            return { info, target };
    }
    return undefined;
}
function validateArrayElementAssignment(arrayName, indexExpr, valueExpr, mutableVars, definedVars, arrayVars, arrayPointerTargets, arrayPointerVarIsMutable, varTypes, varNumericSuffixes) {
    if (!definedVars.has(arrayName) && !arrayPointerTargets.has(arrayName)) {
        throw new Error('undefined variable');
    }
    const pointerMutable = arrayPointerVarIsMutable.get(arrayName);
    if (!mutableVars.has(arrayName)) {
        if (pointerMutable === true) {
            // ok
        }
        else if (pointerMutable === false) {
            throw new Error('cannot assign through immutable pointer');
        }
        else {
            throw new Error('cannot assign to immutable variable');
        }
    }
    validateArrayAccesses(valueExpr, arrayVars, arrayPointerTargets);
    validateArrayLiteralIndexing(valueExpr);
    const resolved = resolveArrayInfo(arrayName, arrayVars, arrayPointerTargets);
    if (!resolved)
        return;
    const indexLiteral = parseIndexLiteral(indexExpr);
    if (indexLiteral === undefined) {
        resolved.info.initializedCount = null;
        return;
    }
    if (indexLiteral < 0 || indexLiteral >= resolved.info.length) {
        throw new Error('array index out of bounds');
    }
    if (resolved.info.initializedCount !== null) {
        if (indexLiteral > resolved.info.initializedCount) {
            throw new Error('array elements must be initialized in order');
        }
        if (indexLiteral === resolved.info.initializedCount) {
            resolved.info.initializedCount += 1;
        }
    }
    const valueInfo = inferExprInfo(valueExpr, varTypes, varNumericSuffixes);
    if (resolved.info.elementKind === 'Numeric' && valueInfo.kind === 'Bool') {
        throw new Error('array element type mismatch');
    }
    if (resolved.info.elementKind === 'Bool' && valueInfo.kind === 'Numeric') {
        throw new Error('array element type mismatch');
    }
}
function validateArrayAccesses(expr, arrayVars, arrayPointerTargets) {
    const regex = /\b([a-zA-Z_]\w*)\s*\[\s*([^\]]+)\s*\]/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
        const name = match[1];
        const indexExpr = match[2];
        const resolved = resolveArrayInfo(name, arrayVars, arrayPointerTargets);
        if (!resolved)
            continue;
        const indexLiteral = parseIndexLiteral(indexExpr);
        if (indexLiteral === undefined)
            continue;
        if (indexLiteral < 0 || indexLiteral >= resolved.info.length) {
            throw new Error('array index out of bounds');
        }
        if (resolved.info.initializedCount !== null && indexLiteral >= resolved.info.initializedCount) {
            throw new Error('array element is not initialized');
        }
    }
}
function validateArrayLiteralIndexing(expr) {
    const literalIndexRegex = /\[([^\]]*)\]\s*\[\s*(-?\d+)\s*\]/g;
    let match;
    while ((match = literalIndexRegex.exec(expr)) !== null) {
        const elements = splitTopLevel(match[1], ',');
        const index = parseInt(match[2], 10);
        if (index < 0 || index >= elements.length) {
            throw new Error('array index out of bounds');
        }
    }
}
function validateArrayCallRequirements(expr, context) {
    const { arrayVars, arrayPointerTargets, fnArrayParamRequirements } = context;
    forEachCallExpression(expr, (fnName, args, _argsStr) => {
        const requirements = fnArrayParamRequirements.get(fnName);
        if (!requirements || requirements.length === 0)
            return;
        for (const requirement of requirements) {
            const arg = args[requirement.index];
            if (!arg)
                continue;
            const trimmed = arg.trim();
            const literal = parseArrayLiteral(trimmed);
            if (literal) {
                if (literal.length < requirement.minInitialized) {
                    throw new Error('array argument has insufficient initialized elements');
                }
                continue;
            }
            const identMatch = trimmed.match(/^\w+$/);
            if (!identMatch)
                continue;
            const name = identMatch[0];
            const resolved = resolveArrayInfo(name, arrayVars, arrayPointerTargets);
            if (!resolved)
                continue;
            if (resolved.info.initializedCount !== null && resolved.info.initializedCount < requirement.minInitialized) {
                throw new Error('array argument has insufficient initialized elements');
            }
        }
    });
}
function handleArrayRhsIdentifier(varName, rhsIdent, context) {
    if (!rhsIdent)
        return;
    const { arrayVars, arrayPointerTargets } = context;
    const rhsName = rhsIdent[0];
    if (arrayVars.has(rhsName) && !arrayPointerTargets.has(rhsName)) {
        throw new Error('cannot copy arrays');
    }
    if (arrayPointerTargets.has(rhsName)) {
        arrayPointerTargets.set(varName, arrayPointerTargets.get(rhsName));
    }
}
function prepareLetBinding(varName, typeAnnotation, isMutable, context) {
    const { mutableVars, definedVars } = context;
    if (definedVars.has(varName)) {
        throw new Error('variable already declared');
    }
    if (isMutable) {
        mutableVars.add(varName);
    }
    const parsed = parseTypeConstraint(typeAnnotation);
    const resolvedBase = resolveTypeAliasBaseType(parsed.baseType, context);
    const declaredInfo = getDeclaredTypeInfo(resolvedBase, context);
    const arrayTypeInfo = parseArrayType(resolvedBase);
    const dropFn = resolveTypeAliasDropFn(parsed.baseType, context);
    if (dropFn) {
        context.varDropFns.set(varName, dropFn);
    }
    return { declaredInfo, arrayTypeInfo, constraint: parsed.constraint };
}
function prepareValueExpression(value, valueOriginal, context, checkUndefined, disallowVoidCall) {
    const { definedVars } = context;
    const thisAccessNormalized = convertThisAccess(valueOriginal);
    if (checkUndefined) {
        if (!valueOriginal.includes('::')) {
            checkUndefinedVars(thisAccessNormalized, definedVars);
        }
    }
    validateExpressionForCompile(thisAccessNormalized, context, disallowVoidCall);
    const thisConverted = convertThisAccess(value);
    const blockConverted = convertInlineBlockExpressions(thisConverted, context.typeAliases);
    const methodConverted = resolveMethodStyleCall(blockConverted, context).converted;
    const unboundConverted = convertUnboundFunctionPointerAccess(methodConverted);
    const pointerConverted = convertPointerDerefs(unboundConverted, context);
    const isConverted = convertIsExpressions(pointerConverted, context);
    const stringConverted = convertStringIndexing(isConverted, context);
    const structConversion = convertStructLiteralExpression(stringConverted, context);
    return normalizeRefs(convertIfElseToTernary(structConversion.converted));
}
function validateFunctionCalls(expr, context, disallowVoidCall) {
    const { fnSignatures, definedVars, varTypes, varNumericSuffixes, fnPointerVars } = context;
    forEachCallExpression(expr, (fnName, args) => {
        const signature = fnSignatures.get(fnName);
        if (!signature) {
            if (definedVars.has(fnName)) {
                if (!fnPointerVars.has(fnName)) {
                    throw new Error('cannot call non-function');
                }
            }
            return;
        }
        if (args.length !== signature.paramKinds.length) {
            throw new Error('function ' + fnName + ' expects ' + signature.paramKinds.length + ' args');
        }
        for (let i = 0; i < signature.paramKinds.length; i++) {
            const paramKind = signature.paramKinds[i];
            if (paramKind === 'Unknown')
                continue;
            const argInfo = inferExprInfo(args[i], varTypes, varNumericSuffixes);
            if (paramKind === 'Numeric' && argInfo.kind === 'Bool') {
                throw new Error('cannot convert Bool to numeric type');
            }
            if (paramKind === 'Bool' && argInfo.kind === 'Numeric') {
                throw new Error('cannot convert numeric type to Bool');
            }
        }
        if (disallowVoidCall && signature.returnsVoid) {
            throw new Error('void function cannot return a value');
        }
    });
}
function forEachCallExpression(expr, callback) {
    const callRegex = /\b([a-zA-Z_]\w*)\s*\(([^()]*)\)/g;
    let match;
    while ((match = callRegex.exec(expr)) !== null) {
        const fnName = match[1];
        const argsStr = match[2];
        const args = argsStr.trim() ? splitTopLevel(argsStr, ',') : [];
        callback(fnName, args, argsStr);
    }
}
function parseReturnTypeAnnotation(returnType, context) {
    if (!returnType)
        return { kind: 'Unknown', returnsVoid: false };
    const trimmed = returnType.trim();
    if (trimmed === 'Void') {
        return { kind: 'Unknown', returnsVoid: true };
    }
    const declaredInfo = getDeclaredTypeInfo(trimmed, context);
    return { kind: declaredInfo.kind, returnsVoid: false };
}
function inferFunctionReturnInfo(body, paramKinds, context) {
    const localVarTypes = new Map();
    for (const param of paramKinds) {
        if (param.kind !== 'Unknown') {
            localVarTypes.set(param.name, param.kind);
        }
    }
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
        const endIndex = findMatchingClosing(trimmed, 0, '{', '}');
        const blockContent = endIndex === -1 ? '' : trimmed.slice(1, endIndex).trim();
        const stmts = splitBlockStatements(blockContent);
        if (stmts.length === 0) {
            return { kind: 'Unknown', returnsVoid: true };
        }
        const lastStmt = stmts[stmts.length - 1];
        if (isNonValueStatement(lastStmt)) {
            return { kind: 'Unknown', returnsVoid: true };
        }
        const info = inferExprInfo(lastStmt, localVarTypes, context.varNumericSuffixes);
        return { kind: info.kind, returnsVoid: false };
    }
    if (!trimmed) {
        return { kind: 'Unknown', returnsVoid: true };
    }
    const info = inferExprInfo(trimmed, localVarTypes, context.varNumericSuffixes);
    return { kind: info.kind, returnsVoid: false };
}
function registerFunctionSignature(fnName, parsedParams, returnType, body, context) {
    const { fnSignatures, definedVars } = context;
    if (fnSignatures.has(fnName)) {
        throw new Error('function already defined: ' + fnName);
    }
    const declaredReturn = parseReturnTypeAnnotation(returnType, context);
    const inferredReturn = inferFunctionReturnInfo(body, parsedParams, context);
    let returnKind = inferredReturn.kind;
    let returnsVoid = inferredReturn.returnsVoid;
    if (declaredReturn.returnsVoid) {
        returnKind = 'Unknown';
        returnsVoid = true;
    }
    else if (declaredReturn.kind !== 'Unknown') {
        if (declaredReturn.kind === 'Numeric' && inferredReturn.kind === 'Bool') {
            throw new Error('cannot return boolean value from non-bool function');
        }
        if (declaredReturn.kind === 'Bool' && inferredReturn.kind === 'Numeric') {
            throw new Error('cannot return numeric value from bool function');
        }
        returnKind = declaredReturn.kind;
        returnsVoid = false;
    }
    const signature = {
        paramKinds: parsedParams.map((param) => param.kind),
        paramNames: parsedParams.map((param) => param.name),
        paramIsPointer: parsedParams.map((param) => param.isPointer),
        paramPointerMutables: parsedParams.map((param) => param.pointerMutable),
        returnKind,
        returnsVoid,
        returnTypeAnnotation: returnType ? returnType.trim() : undefined,
    };
    fnSignatures.set(fnName, signature);
    definedVars.add(fnName);
    return signature;
}
function getFunctionCallReturnInfo(expr, context) {
    const match = expr.trim().match(/^([a-zA-Z_]\w*)\s*\(([^()]*)\)$/);
    if (!match)
        return undefined;
    const fnName = match[1];
    const signature = context.fnSignatures.get(fnName);
    if (!signature)
        return undefined;
    return { kind: signature.returnKind, returnsVoid: signature.returnsVoid };
}
function splitLeadingFunctionDefinition(stmt) {
    const trimmed = stmt.trim();
    if (!trimmed.startsWith('fn '))
        return undefined;
    const arrowIndex = trimmed.indexOf('=>');
    if (arrowIndex === -1)
        return undefined;
    const afterArrow = trimmed.slice(arrowIndex + 2).trim();
    if (!afterArrow.startsWith('{')) {
        return { definition: trimmed, trailing: '' };
    }
    const bodyStart = trimmed.indexOf('{', arrowIndex);
    if (bodyStart === -1)
        return undefined;
    const bodyEnd = findMatchingClosing(trimmed, bodyStart, '{', '}');
    if (bodyEnd === -1) {
        throw new Error('unmatched opening brace');
    }
    const definition = trimmed.slice(0, bodyEnd + 1).trim();
    const trailing = trimmed.slice(bodyEnd + 1).trim();
    return { definition, trailing };
}
function splitLeadingBlockDeclaration(stmt, keyword) {
    const trimmed = stmt.trim();
    if (!trimmed.startsWith(keyword + ' '))
        return undefined;
    const braceStart = trimmed.indexOf('{');
    if (braceStart === -1)
        return undefined;
    const braceEnd = findMatchingClosing(trimmed, braceStart, '{', '}');
    if (braceEnd === -1) {
        throw new Error('unmatched opening brace');
    }
    const declaration = trimmed.slice(0, braceEnd + 1).trim();
    const trailing = trimmed.slice(braceEnd + 1).trim();
    return { declaration, trailing };
}
function splitLeadingStructDeclaration(stmt) {
    return splitLeadingBlockDeclaration(stmt, 'struct');
}
function splitLeadingObjectDeclaration(stmt) {
    return splitLeadingBlockDeclaration(stmt, 'object');
}
function parseObjectDeclaration(declaration) {
    const trimmed = declaration.trim();
    if (!trimmed.startsWith('object '))
        return null;
    const nameMatch = trimmed.match(/^object\s+([a-zA-Z_]\w*)/);
    if (!nameMatch)
        return null;
    const name = nameMatch[1];
    const braceStart = trimmed.indexOf('{');
    if (braceStart === -1)
        return null;
    const braceEnd = findMatchingClosing(trimmed, braceStart, '{', '}');
    if (braceEnd === -1)
        return null;
    const body = trimmed.slice(braceStart + 1, braceEnd).trim();
    return { name, body };
}
function buildObjectDeclaration(declaration, context) {
    const statements = splitBlockStatements(declaration.body);
    const parts = collectThisObjectParts(statements, (value) => prepareValueExpression(value, value, context, true, true), (params) => parseFnParams(params, context), false, (stmt) => convertBlockStatementToJs(stmt, context.typeAliases), (kind, name) => {
        if (kind === 'var') {
            return 'get ' + name + '() { return ' + name + '; }';
        }
        return name + ': ' + name;
    }, context.typeAliases);
    context.definedVars.add(declaration.name);
    // Track singleton methods for method resolution
    const methods = new Set();
    for (const stmt of statements) {
        const fnDef = parseFunctionDefinitionForCompile(stmt.trim());
        if (fnDef) {
            methods.add(fnDef.name);
        }
    }
    context.singletonMethods.set(declaration.name, methods);
    const body = parts.locals.join(' ');
    const members = parts.members.join(', ');
    return 'const ' + declaration.name + ' = (function () { ' + body + ' return { ' + members + ' }; })();';
}
function applyArrayInitializer(varName, typeAnnotation, valueOriginal, context, arrayTypeInfoOverride) {
    const { arrayVars, arrayPointerTargets, varTypes, varNumericSuffixes } = context;
    const arrayTypeInfo = arrayTypeInfoOverride || parseArrayType(typeAnnotation);
    const literalElements = parseArrayLiteral(valueOriginal);
    const rhsIdent = valueOriginal.match(/^\w+$/);
    if (arrayTypeInfo) {
        if (literalElements) {
            validateArrayLiteral(literalElements, arrayTypeInfo, valueOriginal);
            arrayVars.set(varName, {
                length: arrayTypeInfo.length !== undefined ? arrayTypeInfo.length : literalElements.length,
                initializedCount: literalElements.length,
                elementKind: arrayTypeInfo.elementKind,
            });
        }
        else {
            handleArrayRhsIdentifier(varName, rhsIdent, context);
            if (arrayTypeInfo.length !== undefined) {
                arrayVars.set(varName, {
                    length: arrayTypeInfo.length,
                    initializedCount: arrayTypeInfo.initializedCount !== undefined ? arrayTypeInfo.initializedCount : null,
                    elementKind: arrayTypeInfo.elementKind,
                });
            }
        }
        if (arrayTypeInfo.isPointer) {
            const pointerTarget = parseAddressOfTarget(valueOriginal);
            if (pointerTarget && arrayVars.has(pointerTarget)) {
                arrayPointerTargets.set(varName, pointerTarget);
            }
        }
    }
    else {
        if (literalElements) {
            arrayVars.set(varName, {
                length: literalElements.length,
                initializedCount: literalElements.length,
                elementKind: inferArrayLiteralElementKind(literalElements, varTypes, varNumericSuffixes),
            });
        }
        else if (rhsIdent) {
            handleArrayRhsIdentifier(varName, rhsIdent, context);
        }
    }
}
function handleLetInitializer(varName, typeAnnotation, value, valueOriginal, isMutable, context) {
    const { varTypes, varNumericSuffixes, varInitialized, definedVars, structVarTypes, structDefs } = context;
    const { declaredInfo, arrayTypeInfo, constraint } = prepareLetBinding(varName, typeAnnotation, isMutable, context);
    if (!typeAnnotation) {
        context.untypedVars.add(varName);
    }
    const pointerInfo = parsePointerTypeAnnotation(typeAnnotation, context);
    const target = parseAddressOfTarget(valueOriginal);
    if (target === 'this') {
        const thisObject = buildThisScopeObject(context);
        definedVars.add(varName);
        varInitialized.set(varName, true);
        varTypes.set(varName, declaredInfo.kind);
        context.thisPointerVars.add(varName);
        const valueConverted = thisObject;
        return 'let ' + varName + ' = ' + valueConverted + '; ';
    }
    if (target) {
        if (!definedVars.has(target)) {
            throw new Error('undefined variable');
        }
        const isMutableRef = /&\s*mut\s+/.test(valueOriginal);
        const pointerKind = pointerInfo ? pointerInfo.kind : context.varTypes.get(target) || 'Unknown';
        const pointerMutable = pointerInfo ? pointerInfo.mutable : isMutableRef;
        if (pointerMutable && !context.mutableVars.has(target)) {
            throw new Error('cannot take mutable reference to immutable variable');
        }
        if (pointerMutable && context.pointerMutableTargets.has(target)) {
            throw new Error('cannot have multiple mutable references to the same variable');
        }
        const targetKind = context.varTypes.get(target) || (context.varNumericSuffixes.has(target) || context.implicitNumericVars.has(target) ? 'Numeric' : 'Unknown');
        if (pointerKind === 'Bool' && targetKind !== 'Bool') {
            throw new Error('type mismatch');
        }
        if (pointerKind === 'Numeric' && targetKind === 'Bool') {
            throw new Error('type mismatch');
        }
        context.pointerTargets.set(varName, target);
        context.pointerVarKinds.set(varName, pointerKind);
        context.pointerVarIsMutable.set(varName, pointerMutable);
        if (pointerMutable) {
            context.pointerMutableTargets.set(target, varName);
        }
    }
    if (isFunctionPointerType(typeAnnotation, context) || (valueOriginal.trim().match(/^\w+$/) && context.fnSignatures.has(valueOriginal.trim()))) {
        context.fnPointerVars.add(varName);
    }
    const callNameMatch = valueOriginal.trim().match(/^([a-zA-Z_]\w*)(?:\s*<[^>]+>)?\s*\(/);
    if (callNameMatch) {
        const callName = callNameMatch[1];
        const members = context.thisMemberSets.get(callName);
        if (members) {
            context.thisValueMembers.set(varName, members);
        }
        const signature = context.fnSignatures.get(callName);
        if (signature && signature.returnTypeAnnotation) {
            const arrayReturnInfo = parseArrayPointerReturnInfo(signature.returnTypeAnnotation);
            if (arrayReturnInfo.isArrayPointer) {
                context.arrayPointerVarIsMutable.set(varName, arrayReturnInfo.mutable);
            }
        }
    }
    const exprInfo = inferExprInfo(valueOriginal, varTypes, varNumericSuffixes);
    ensureNoBoolArithmetic(valueOriginal, varTypes);
    applyArrayInitializer(varName, typeAnnotation, valueOriginal, context, arrayTypeInfo);
    validateNumericConstraint(valueOriginal, constraint);
    const structTypeName = parseStructTypeName(typeAnnotation, context);
    if (structTypeName && structDefs.has(structTypeName)) {
        structVarTypes.set(varName, structTypeName);
    }
    const structLiteral = parseStructLiteralExpression(valueOriginal, context);
    if (structLiteral) {
        structVarTypes.set(varName, structLiteral.name);
        const fieldKinds = inferStructFieldKinds(structLiteral.name, structLiteral.values, context);
        context.structVarFieldKinds.set(varName, fieldKinds);
    }
    const callReturn = getFunctionCallReturnInfo(valueOriginal, context);
    if (callReturn) {
        if (callReturn.returnsVoid) {
            throw new Error('void function cannot return a value');
        }
        if (declaredInfo.kind === 'Numeric' && callReturn.kind === 'Bool') {
            throw new Error('cannot convert Bool to numeric type');
        }
        if (declaredInfo.kind === 'Bool' && callReturn.kind === 'Numeric') {
            throw new Error('cannot convert numeric type to Bool');
        }
    }
    if (declaredInfo.kind !== 'Unknown' && exprInfo.kind !== 'Unknown' && declaredInfo.kind !== exprInfo.kind) {
        throw new Error('type mismatch');
    }
    if (declaredInfo.kind === 'Bool' && exprInfo.kind === 'Numeric') {
        throw new Error('cannot convert numeric type to Bool');
    }
    if (declaredInfo.kind === 'Numeric' && exprInfo.kind === 'Bool') {
        throw new Error('cannot convert Bool to numeric type');
    }
    if (declaredInfo.numericSuffix) {
        let effectiveSuffixes = exprInfo.numericSuffixes;
        if (effectiveSuffixes.length === 0) {
            const trimmedValue = valueOriginal.trim();
            const identMatch = trimmedValue.match(/^\w+$/);
            if (identMatch) {
                if (context.untypedVars.has(trimmedValue) && declaredInfo.numericSuffix !== 'I32') {
                    throw new Error('cannot convert numeric type to smaller width');
                }
                if (declaredInfo.numericSuffix !== 'I32' && varTypes.get(trimmedValue) === 'Numeric') {
                    const sourceSuffix = varNumericSuffixes.get(trimmedValue);
                    if (!sourceSuffix || isNumericSuffixWider(sourceSuffix, declaredInfo.numericSuffix)) {
                        throw new Error('cannot convert numeric type to smaller width');
                    }
                }
                if (context.implicitNumericVars.has(trimmedValue) && declaredInfo.numericSuffix !== 'I32') {
                    throw new Error('cannot convert numeric type to smaller width');
                }
                const existingSuffix = varNumericSuffixes.get(trimmedValue);
                if (existingSuffix) {
                    effectiveSuffixes = [existingSuffix];
                }
                else if (context.implicitNumericVars.has(trimmedValue)) {
                    effectiveSuffixes = ['I32'];
                }
            }
        }
        for (const suffix of effectiveSuffixes) {
            if (isNumericSuffixWider(suffix, declaredInfo.numericSuffix)) {
                throw new Error('cannot convert numeric type to smaller width');
            }
        }
        varNumericSuffixes.set(varName, declaredInfo.numericSuffix);
    }
    else if (exprInfo.numericSuffixes.length > 0) {
        varNumericSuffixes.set(varName, exprInfo.numericSuffixes[0]);
    }
    else if (exprInfo.kind === 'Numeric') {
        varNumericSuffixes.set(varName, 'I32');
        if (!typeAnnotation) {
            context.implicitNumericVars.add(varName);
            context.untypedVars.add(varName);
        }
    }
    definedVars.add(varName);
    varInitialized.set(varName, true);
    varTypes.set(varName, declaredInfo.kind !== 'Unknown' ? declaredInfo.kind : exprInfo.kind);
    if (isStringTypeAnnotation(typeAnnotation, context) || isStringLiteral(valueOriginal)) {
        context.stringVars.add(varName);
    }
    // Check if the type annotation has a drop function
    if (typeAnnotation) {
        const dropFn = resolveTypeAliasDropFn(typeAnnotation, context);
        if (dropFn) {
            context.varDropFns.set(varName, dropFn);
        }
    }
    const valueConverted = prepareValueExpression(value, valueOriginal, context, true, true);
    return 'let ' + varName + ' = ' + valueConverted + '; ';
}
function handleLetNoInit(varName, typeAnnotation, isMutable, context) {
    const { definedVars, varTypes, varNumericSuffixes, varInitialized, arrayVars, structVarTypes } = context;
    const { declaredInfo, arrayTypeInfo } = prepareLetBinding(varName, typeAnnotation, isMutable, context);
    const structTypeName = parseStructTypeName(typeAnnotation, context);
    if (structTypeName) {
        structVarTypes.set(varName, structTypeName);
    }
    if (declaredInfo.kind !== 'Unknown') {
        varTypes.set(varName, declaredInfo.kind);
    }
    if (isStringTypeAnnotation(typeAnnotation, context)) {
        context.stringVars.add(varName);
    }
    if (declaredInfo.numericSuffix) {
        varNumericSuffixes.set(varName, declaredInfo.numericSuffix);
    }
    if (arrayTypeInfo && arrayTypeInfo.length !== undefined) {
        arrayVars.set(varName, {
            length: arrayTypeInfo.length,
            initializedCount: arrayTypeInfo.initializedCount !== undefined ? arrayTypeInfo.initializedCount : 0,
            elementKind: arrayTypeInfo.elementKind,
        });
    }
    definedVars.add(varName);
    varInitialized.set(varName, false);
    // Check if the type annotation has a drop function
    if (typeAnnotation) {
        const dropFn = resolveTypeAliasDropFn(typeAnnotation, context);
        if (dropFn) {
            context.varDropFns.set(varName, dropFn);
        }
    }
    if (arrayTypeInfo && arrayTypeInfo.length !== undefined) {
        return 'let ' + varName + ' = new Array(' + arrayTypeInfo.length + '); ';
    }
    return 'let ' + varName + '; ';
}
function handleAssignment(varName, operator, value, valueOriginal, context) {
    const { mutableVars, definedVars, varTypes, varNumericSuffixes, varInitialized } = context;
    validateAssignment(varName, operator, valueOriginal, mutableVars, definedVars, varTypes, varNumericSuffixes, varInitialized);
    const callReturn = getFunctionCallReturnInfo(valueOriginal, context);
    if (callReturn) {
        if (callReturn.returnsVoid) {
            throw new Error('void function cannot return a value');
        }
        const varType = varTypes.get(varName);
        if (varType === 'Numeric' && callReturn.kind === 'Bool') {
            throw new Error('cannot convert Bool to numeric type');
        }
        if (varType === 'Bool' && callReturn.kind === 'Numeric') {
            throw new Error('cannot convert numeric type to Bool');
        }
    }
    const valueConverted = prepareValueExpression(value, valueOriginal, context, false, true);
    return varName + ' ' + operator + ' ' + valueConverted + '; ';
}
function splitLeadingBlockExpression(expr) {
    const trimmed = expr.trim();
    if (!trimmed.startsWith('{'))
        return undefined;
    let braceDepth = 0;
    let endIndex = -1;
    for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '{')
            braceDepth++;
        if (trimmed[i] === '}')
            braceDepth--;
        if (braceDepth === 0) {
            endIndex = i;
            break;
        }
    }
    if (endIndex === -1)
        return undefined;
    const blockContent = trimmed.slice(1, endIndex).trim();
    const trailing = trimmed.slice(endIndex + 1).trim();
    return { blockContent, trailing };
}
/**
 * Find the index of the closing parenthesis that matches an opening paren.
 */
function findMatchingClosingParen(str, openParenIndex) {
    let count = 1;
    for (let i = openParenIndex + 1; i < str.length; i++) {
        if (str[i] === '(')
            count++;
        if (str[i] === ')')
            count--;
        if (count === 0)
            return i;
    }
    return -1;
}
/**
 * Check if a position contains an 'if' keyword with word boundary.
 */
function isIfKeyword(str, pos) {
    return str.slice(pos, pos + 2) === 'if' && (pos === 0 || !/\w/.test(str[pos - 1]));
}
/**
 * Check if a position contains an 'else' keyword with word boundary.
 */
function isElseKeyword(str, pos) {
    return str.slice(pos, pos + 4) === 'else' && (pos === 0 || !/\w/.test(str[pos - 1]));
}
/**
 * Find the matching else for an if by tracking nested if/else depth.
 * Returns the index of the matching else, or -1 if not found.
 */
function findMatchingElse(str, ifStartIndex, conditionEnd) {
    let ifDepth = 0;
    let branchStart = conditionEnd + 1;
    for (let i = branchStart; i < str.length; i++) {
        if (isIfKeyword(str, i)) {
            ifDepth++;
            i++;
        }
        else if (isElseKeyword(str, i)) {
            if (ifDepth === 0) {
                return i;
            }
            ifDepth--;
            i += 3;
        }
    }
    return -1;
}
/**
 * Convert if/else expressions to ternary operators.
 * Processes innermost if/else first to handle nesting correctly.
 */
function convertIfElseToTernary(code) {
    let result = code;
    let changed = true;
    while (changed) {
        changed = false;
        // Find the INNERMOST if/else pair (one with no nested if between condition and else)
        let targetIfIndex = -1;
        let offset = 0;
        while (offset < result.length) {
            const ifIdx = result.indexOf('if', offset);
            if (ifIdx === -1)
                break;
            // Make sure it's a word boundary
            if (ifIdx > 0 && /\w/.test(result[ifIdx - 1])) {
                offset = ifIdx + 1;
                continue;
            }
            // Find the opening paren after this if
            const parenStart = result.indexOf('(', ifIdx);
            if (parenStart === -1) {
                offset = ifIdx + 2;
                continue;
            }
            // Find the matching closing paren
            const parenEnd = findMatchingClosingParen(result, parenStart);
            if (parenEnd === -1) {
                offset = ifIdx + 2;
                continue;
            }
            // Check if there's any 'if' between parenEnd and the next 'else'
            // This would indicate a nested if/else
            const branchStart = parenEnd + 1;
            let hasNestedIf = false;
            for (let i = branchStart; i < result.length; i++) {
                if (isElseKeyword(result, i)) {
                    // Found an else - check if there was an if before it
                    break;
                }
                if (isIfKeyword(result, i)) {
                    hasNestedIf = true;
                    break;
                }
            }
            if (!hasNestedIf) {
                // This is a good candidate - innermost if/else
                targetIfIndex = ifIdx;
                break;
            }
            offset = ifIdx + 2;
        }
        if (targetIfIndex === -1)
            break;
        // Now process this if/else
        const ifIndex = targetIfIndex;
        const parenStart = result.indexOf('(', ifIndex);
        const parenEnd = findMatchingClosingParen(result, parenStart);
        const condition = result.slice(parenStart + 1, parenEnd);
        // Find the matching else for this if by tracking nested if/else depth
        const elseIndex = findMatchingElse(result, ifIndex, parenEnd);
        if (elseIndex === -1)
            break;
        let branchStart = parenEnd + 1;
        while (branchStart < result.length && /\s/.test(result[branchStart])) {
            branchStart++;
        }
        const trueBranch = result.slice(branchStart, elseIndex).trim();
        // Find the false branch
        let falseStart = elseIndex + 4;
        while (falseStart < result.length && /\s/.test(result[falseStart])) {
            falseStart++;
        }
        // The false branch goes until a semicolon, or until we see another 'else' at depth 0
        let falseEnd = result.length;
        let depth = 0;
        for (let i = falseStart; i < result.length; i++) {
            if (result[i] === ';') {
                falseEnd = i;
                break;
            }
            // Track if/else depth
            if (isIfKeyword(result, i)) {
                depth++;
                i++;
            }
            else if (isElseKeyword(result, i)) {
                if (depth === 0) {
                    // Found another else at our level - false branch ends here
                    falseEnd = i;
                    break;
                }
                depth--;
                i += 3;
            }
        }
        const falseBranch = result.slice(falseStart, falseEnd).trim();
        // Build the ternary expression
        const ternary = '(' + condition + ' ? ' + trueBranch + ' : ' + falseBranch + ')';
        // Replace the if/else with the ternary
        const remaining = result.slice(falseEnd);
        result = result.slice(0, ifIndex) + ternary + remaining;
        changed = true;
    }
    return result;
}
/**
 * Check if an expression references undefined variables.
 * This is a simple heuristic that checks for bare identifiers.
 */
function checkUndefinedVars(expr, definedVars) {
    let sanitized = expr.replace(/"(?:\\.|[^"\\])*"/g, '').replace(/'(?:\\.|[^'\\])*'/g, '');
    let result = '';
    let braceDepth = 0;
    for (let i = 0; i < sanitized.length; i++) {
        const ch = sanitized[i];
        if (ch === '{') {
            braceDepth++;
            continue;
        }
        if (ch === '}') {
            braceDepth = Math.max(0, braceDepth - 1);
            continue;
        }
        if (braceDepth === 0) {
            result += ch;
        }
    }
    sanitized = result;
    // Extract all identifiers from the expression
    // This is a simple regex that finds word characters that aren't part of numbers or operators
    const identifierRegex = /\b[a-zA-Z_]\w*\b/g;
    let match;
    while ((match = identifierRegex.exec(sanitized)) !== null) {
        const id = match[0];
        const index = match.index;
        const prevChar = index > 0 ? sanitized[index - 1] : '';
        if (prevChar === '.' || prevChar === ':' || prevChar === '&') {
            continue;
        }
        if (id === 'this') {
            continue;
        }
        // Skip JavaScript/Tuff keywords
        if (RESERVED_KEYWORDS.has(id))
            continue;
        if (currentStructNames && currentStructNames.has(id))
            continue;
        if (currentTypeAliasNames && currentTypeAliasNames.has(id))
            continue;
        // Skip numeric type names
        const typeNames = new Set(['U8', 'U16', 'U32', 'U64', 'USize', 'I8', 'I16', 'I32', 'I64', 'I32', 'Bool', 'Str', 'Void']);
        if (typeNames.has(id))
            continue;
        // Check if this identifier is defined
        if (!definedVars.has(id)) {
            throw new Error('undefined variable: ' + id);
        }
    }
}
/**
 * Run compiled JavaScript code and return the numeric result.
 * @param jsCode - JavaScript code to execute
 * @returns Numeric result from execution
 */
function executeJavaScript(jsCode) {
    try {
        const fn = new Function(jsCode);
        const result = fn();
        return typeof result === 'number' ? Math.floor(result) : 0;
    }
    catch (e) {
        // If execution fails, re-throw the error
        throw e;
    }
}
/**
 * Execute Tuff code by compiling it to JavaScript and running it.
 * Takes Tuff source code as input, compiles it, and executes it.
 * @param input - Tuff source code to execute
 * @returns Numeric result from execution
 */
function execute(input) {
    const trimmed = input.trim();
    const hasReturn = /\breturn\b/.test(trimmed);
    const hasFunction = /\bfunction\b/.test(trimmed);
    const looksLikeJs = hasReturn || hasFunction;
    const looksLikeTuff = /\bfn\b/.test(trimmed);
    if (looksLikeJs && !looksLikeTuff) {
        return executeJavaScript(input);
    }
    const jsCode = compile(input);
    return executeJavaScript(jsCode);
}
/**
 * Compile multiple Tuff code files into a single executable JavaScript artifact.
 * Mirrors interpretAll() signature for multi-file module support.
 * Currently stubbed; implementation deferred.
 * @param inputs - Array of Tuff source code strings
 * @param config - Map of module paths to source code
 * @param nativeConfig - Map of native configurations
 * @returns Bundled JavaScript code
 */
function compileAll(_inputs, _config, _nativeConfig) {
    const prepared = prepareExternBindings(_inputs, _config, _nativeConfig);
    if (!prepared.hasContent || !prepared.externBindings)
        return 'return 0;';
    const { parts, externLets, externFns, nativeModuleMap } = prepared.plan;
    const externValueByName = prepared.externBindings.externValueByName;
    const resolvedFns = prepared.externBindings.resolvedFns;
    const externPreludeParts = buildExternPreludeParts(externLets, externValueByName);
    const externFnPreludeParts = [];
    for (const externFn of externFns) {
        const paramParts = externFn.params ? splitTopLevel(externFn.params, ',') : [];
        const paramNames = paramParts
            .map((part) => {
            const match = part.trim().match(/^([a-zA-Z_]\w*)/);
            return match ? match[1] : '';
        })
            .filter(Boolean);
        const callArgs = paramNames.join(', ');
        const wrapperName = '__tuff_extern_' + externFn.name;
        const returnType = externFn.returnType ? ' : ' + externFn.returnType : '';
        const generics = externFn.generics ? externFn.generics : '';
        const params = externFn.params ? externFn.params : '';
        const callExpr = wrapperName + '(' + callArgs + ')';
        const body = externFn.returnType === 'Void' ? '{ ' + callExpr + '; }' : callExpr;
        externFnPreludeParts.push(['fn ', externFn.name, generics, '(', params, ')', returnType, ' => ', body, ';'].join(''));
    }
    const combined = combineCodeParts(externPreludeParts.concat(externFnPreludeParts, parts));
    if (!combined.trim()) {
        return 'return 0;';
    }
    const sanitized = stripExplicitTypeArgsFromCalls(combined);
    const compiled = compile(sanitized);
    const moduleVarByName = new Map();
    const nativeModulePreludeParts = [];
    const externFnAssignments = [];
    for (const [fnName, moduleName] of resolvedFns.externFnModuleByName) {
        let moduleVar = moduleVarByName.get(moduleName);
        if (!moduleVar) {
            const nativeSource = nativeModuleMap.get(moduleName);
            if (!nativeSource) {
                throw new Error(buildMissingNativeModuleMessage(moduleName, 'extern fn ' + fnName + ' from ' + moduleName));
            }
            moduleVar = '__tuff_native_module_' + moduleName;
            moduleVarByName.set(moduleName, moduleVar);
            const jsCode = transpileNativeSource(nativeSource);
            nativeModulePreludeParts.push([
                'const ',
                moduleVar,
                ' = (function() {',
                '\nconst exports = {};',
                '\nconst module = { exports: exports };\n',
                jsCode,
                '\nreturn module.exports;\n',
                '})();',
            ].join(''));
        }
        externFnAssignments.push(['const __tuff_extern_', fnName, ' = ', moduleVar, '.', fnName, ';'].join(''));
    }
    const nativePrelude = nativeModulePreludeParts.concat(externFnAssignments).join('\n');
    if (!nativePrelude.trim()) {
        return compiled;
    }
    return nativePrelude + '\n' + compiled;
}
/**
 * Interpret the given input string and produce a numeric result.
 * This function supports numeric literals (integers and decimals), optionally
 * followed by a type suffix such as `U8` (unsigned 8-bit). Examples:
 * - Empty input returns 0
 * - Numeric input (e.g., "100", "-3.14") returns that numeric value
 * - Numeric with suffix (e.g., "100U8") returns the numeric value, ignoring the suffix
 * - Otherwise returns 0 (stub behavior)
 */
function interpret(input) {
    const buildFunctionNotFoundMessage = (fnName, contextInfo) => {
        return ('function not found: ' +
            fnName +
            '. Cause: call references an undefined function. Reason: functions must be declared before use. Fix: define fn ' +
            fnName +
            '(...) or correct the call. Context: ' +
            contextInfo +
            '.');
    };
    function stripComments(source) {
        let out = '';
        let i = 0;
        let inLineComment = false;
        let inBlockComment = false;
        let inString = false;
        let inChar = false;
        while (i < source.length) {
            const ch = source[i];
            const next = i + 1 < source.length ? source[i + 1] : '';
            if (inLineComment) {
                if (ch === '\n') {
                    inLineComment = false;
                    out += ch;
                }
                i++;
                continue;
            }
            if (inBlockComment) {
                if (ch === '*' && next === '/') {
                    inBlockComment = false;
                    i += 2;
                    continue;
                }
                i++;
                continue;
            }
            if (!inString && !inChar && ch === '/' && next === '/') {
                inLineComment = true;
                i += 2;
                continue;
            }
            if (!inString && !inChar && ch === '/' && next === '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }
            if (!inChar && ch === '"') {
                inString = !inString;
                out += ch;
                i++;
                continue;
            }
            if (!inString && ch === "'") {
                inChar = !inChar;
                out += ch;
                i++;
                continue;
            }
            out += ch;
            i++;
        }
        return out;
    }
    const s = stripComments(input)
        .replace(/\n\s*\./g, '.')
        .trim();
    if (s === '')
        return 0;
    const typeAliases = new Map();
    // helper to validate a value against a suffix kind/width
    function validateValueAgainstSuffix(val, kind, width) {
        if (kind === 'Bool') {
            if (val !== 0 && val !== 1) {
                throw new Error('boolean literal must be 0 or 1');
            }
            return;
        }
        if (!Number.isInteger(val)) {
            throw new Error(kind === 'U' ? 'unsigned literal must be integer' : 'signed literal must be integer');
        }
        if (kind === 'U') {
            if (val < 0)
                throw new Error('unsigned literal cannot be negative');
            const max = Math.pow(2, width) - 1;
            if (val > max)
                throw new Error('unsigned literal out of range');
        }
        else {
            const min = -Math.pow(2, width - 1);
            const max = Math.pow(2, width - 1) - 1;
            if (val < min || val > max)
                throw new Error('signed literal out of range');
        }
    }
    function suffixKind(suffix) {
        if (suffix.kind === 'Ptr')
            return 'Ptr<' + suffixKind(suffix.pointsTo) + '>';
        if (suffix.kind === 'Void')
            return 'Void';
        if (suffix.kind === 'Generic')
            return suffix.name;
        if (suffix.kind === 'Tuple') {
            return '(' + suffix.elements.map(suffixKind).join(', ') + ')';
        }
        if (suffix.kind === 'Array') {
            if (suffix.length < 0 || suffix.initializedCount < 0) {
                return '[' + suffixKind(suffix.elementType) + ']';
            }
            return '[' + suffixKind(suffix.elementType) + '; ' + suffix.initializedCount + '; ' + suffix.length + ']';
        }
        if (suffix.kind === 'This') {
            return 'This';
        }
        if (suffix.kind === 'Char') {
            return 'Char';
        }
        if (suffix.kind === 'Str') {
            return 'Str';
        }
        if (suffix.kind === 'FnPtr') {
            const paramStrs = suffix.paramTypes.map((p) => suffixKind(p));
            const returnStr = suffixKind(suffix.returnType);
            return '(' + paramStrs.join(', ') + ') => ' + returnStr;
        }
        return suffix.kind + suffix.width;
    }
    function buildFunctionPointerValue(fnName, functions) {
        const fnDef = functions.get(fnName);
        if (!fnDef) {
            throw new Error(buildFunctionNotFoundMessage(fnName, 'function pointer ' + fnName));
        }
        const returnType = fnDef.returnType || { kind: 'I', width: 32 };
        const paramTypes = fnDef.params.map((param) => param.type);
        return { value: 0, type: { kind: 'FnPtr', paramTypes, returnType }, refersToFn: fnName };
    }
    function typeEqualsForValidation(leftType, rightType) {
        if (leftType.kind === 'Generic') {
            const leftAlias = resolveTypeAlias(leftType.name);
            if (leftAlias) {
                return typeEqualsForValidation(leftAlias, rightType);
            }
        }
        if (rightType.kind === 'Generic') {
            const rightAlias = resolveTypeAlias(rightType.name);
            if (rightAlias) {
                return typeEqualsForValidation(leftType, rightAlias);
            }
        }
        if (leftType.kind !== rightType.kind)
            return false;
        if (leftType.kind === 'Ptr' && rightType.kind === 'Ptr') {
            return leftType.mutable === rightType.mutable && typeEqualsForValidation(leftType.pointsTo, rightType.pointsTo);
        }
        if (leftType.kind === 'Array' && rightType.kind === 'Array') {
            return (leftType.length === rightType.length &&
                leftType.initializedCount === rightType.initializedCount &&
                typeEqualsForValidation(leftType.elementType, rightType.elementType));
        }
        if (leftType.kind === 'Tuple' && rightType.kind === 'Tuple') {
            if (leftType.elements.length !== rightType.elements.length)
                return false;
            for (let i = 0; i < leftType.elements.length; i++) {
                if (!typeEqualsForValidation(leftType.elements[i], rightType.elements[i]))
                    return false;
            }
            return true;
        }
        if (leftType.kind === 'FnPtr' && rightType.kind === 'FnPtr') {
            if (leftType.paramTypes.length !== rightType.paramTypes.length)
                return false;
            for (let i = 0; i < leftType.paramTypes.length; i++) {
                if (!typeEqualsForValidation(leftType.paramTypes[i], rightType.paramTypes[i])) {
                    return false;
                }
            }
            return typeEqualsForValidation(leftType.returnType, rightType.returnType);
        }
        if ('width' in leftType && 'width' in rightType) {
            return leftType.kind === rightType.kind && leftType.width === rightType.width;
        }
        return true;
    }
    function validateNarrowing(source, target) {
        if (target.kind === 'Void') {
            if (source && source.kind !== 'Void') {
                throw new Error('void function cannot return a value');
            }
            return;
        }
        if (target.kind === 'This') {
            if (source && source.kind !== 'This') {
                throw new Error('cannot convert non-This type to This');
            }
            return;
        }
        if (source && source.kind === 'This') {
            throw new Error('cannot convert This to non-This type');
        }
        if (target.kind === 'FnPtr') {
            if (!source || source.kind !== 'FnPtr') {
                throw new Error('cannot convert non-function to function pointer type');
            }
            // Allow conversion from closure (N params) to function pointer with explicit context (N+1 params)
            // where the extra first param is *This
            let sourceOffset = 0;
            let targetOffset = 0;
            if (target.paramTypes.length === source.paramTypes.length + 1 && target.paramTypes[0].kind === 'Ptr' && target.paramTypes[0].pointsTo.kind === 'This') {
                // Skip the first *This param in target when comparing
                targetOffset = 1;
            }
            else if (source.paramTypes.length !== target.paramTypes.length) {
                throw new Error('function pointer parameter length mismatch');
            }
            const effectiveTargetParams = target.paramTypes.length - targetOffset;
            const effectiveSourceParams = source.paramTypes.length - sourceOffset;
            if (effectiveSourceParams !== effectiveTargetParams) {
                throw new Error('function pointer parameter length mismatch');
            }
            for (let i = 0; i < effectiveSourceParams; i++) {
                if (!typeEqualsForValidation(source.paramTypes[i + sourceOffset], target.paramTypes[i + targetOffset])) {
                    throw new Error('function pointer parameter type mismatch');
                }
            }
            if (!typeEqualsForValidation(source.returnType, target.returnType)) {
                throw new Error('function pointer return type mismatch');
            }
            return;
        }
        if (target.kind === 'Generic') {
            return;
        }
        if (target.kind === 'Tuple') {
            if (!source || source.kind !== 'Tuple') {
                throw new Error('cannot convert non-tuple to tuple type');
            }
            if (source.elements.length !== target.elements.length) {
                throw new Error('tuple length mismatch');
            }
            for (let i = 0; i < target.elements.length; i++) {
                validateNarrowing(source.elements[i], target.elements[i]);
            }
            return;
        }
        if (target.kind === 'Array') {
            if (!source || source.kind !== 'Array') {
                throw new Error('cannot convert non-array to array type');
            }
            if (target.length >= 0 && source.length !== target.length) {
                throw new Error('array length mismatch');
            }
            if (target.initializedCount >= 0 && source.initializedCount < target.initializedCount) {
                throw new Error('array initialized count mismatch');
            }
            validateNarrowing(source.elementType, target.elementType);
            return;
        }
        if (source && source.kind === 'Generic') {
            return;
        }
        if (source && source.kind === 'Tuple') {
            throw new Error('cannot convert tuple to non-tuple type');
        }
        if (source && source.kind === 'Array') {
            throw new Error('cannot convert array to non-array type');
        }
        if (target.kind === 'Ptr') {
            // Special case: allow assigning Str to *Str
            if (source && source.kind === 'Str' && target.pointsTo.kind === 'Str') {
                return;
            }
            if (!source || source.kind !== 'Ptr') {
                throw new Error('cannot convert non-pointer to pointer type');
            }
            // Validate pointee types match
            validateNarrowing(source.pointsTo, target.pointsTo);
            return;
        }
        if (source && source.kind === 'Ptr') {
            throw new Error('cannot convert pointer to non-pointer type');
        }
        if (target.kind === 'Bool') {
            if (!source || source.kind !== 'Bool') {
                throw new Error('cannot convert numeric type to Bool');
            }
            return;
        }
        if (source && source.kind === 'Bool') {
            throw new Error('cannot convert Bool to numeric type');
        }
        const effectiveSource = source;
        const sourceIsNumeric = effectiveSource && 'width' in effectiveSource;
        const targetIsNumeric = 'width' in target;
        if (sourceIsNumeric && targetIsNumeric && effectiveSource.width > target.width) {
            const message = ['narrowing conversion from ', suffixKind(effectiveSource), ' to ', suffixKind(target)].join('');
            throw new Error(message);
        }
    }
    // helper to parse a single literal token and validate suffixes
    // returns { value, suffix } where suffix is undefined or { kind, width }
    function parseLiteralToken(token) {
        const t = token.trim();
        if (t === 'true')
            return { value: 1, type: { kind: 'Bool', width: 1 } };
        if (t === 'false')
            return { value: 0, type: { kind: 'Bool', width: 1 } };
        // Check for string literals: "test", "hello", etc.
        const stringMatch = t.match(/^"(.*?)"\s*$/);
        if (stringMatch) {
            const str = stringMatch[1];
            return { value: 0, type: { kind: 'Str' }, stringValue: str };
        }
        // Check for char literals: 'a', 'A', etc.
        const charMatch = t.match(/^'(.)'\s*$/);
        if (charMatch) {
            const char = charMatch[1];
            const charCode = char.charCodeAt(0);
            return { value: charCode, type: { kind: 'Char' } };
        }
        const m = t.match(/^([+-]?\d+(?:\.\d+)?)(?:([A-Za-z]+\d*))?$/);
        if (!m)
            throw new Error('invalid literal');
        const n = Number(m[1]);
        const suffix = m[2];
        if (suffix && /^[u]/.test(suffix)) {
            throw new Error('invalid suffix');
        }
        if (suffix) {
            if (suffix === 'USize') {
                const width = 64;
                validateValueAgainstSuffix(n, 'U', width);
                return { value: Number.isFinite(n) ? n : 0, type: { kind: 'U', width } };
            }
            const m2 = suffix.match(/^([UI])(\d+)$/);
            if (!m2)
                throw new Error('invalid suffix');
            const kind = m2[1];
            const width = Number(m2[2]);
            const allowedWidths = new Set([8, 16, 32, 64]);
            if (!allowedWidths.has(width))
                throw new Error('invalid suffix');
            validateValueAgainstSuffix(n, kind, width);
            return { value: Number.isFinite(n) ? n : 0, type: { kind, width } };
        }
        return { value: Number.isFinite(n) ? n : 0 };
    }
    function ensureVariable(name, context) {
        if (!context.has(name)) {
            throw new Error('undefined variable: ' + name);
        }
        return context.get(name);
    }
    function ensurePointer(name, context) {
        var _a;
        const ptrVar = ensureVariable(name, context);
        if (((_a = ptrVar.type) === null || _a === void 0 ? void 0 : _a.kind) !== 'Ptr') {
            throw new Error('cannot dereference non-pointer type');
        }
        if (!ptrVar.refersTo) {
            throw new Error('pointer does not refer to a variable');
        }
        return ptrVar;
    }
    function resolveStringIndex(str, index) {
        if (index < 0 || index >= str.length) {
            throw new Error('string index out of bounds');
        }
        const char = str[index];
        return { value: char.charCodeAt(0), type: { kind: 'Char' } };
    }
    function resolveArrayElementFromList(elements, index) {
        if (index < 0 || index >= elements.length) {
            throw new Error('array index out of bounds');
        }
        const element = elements[index];
        if (!element) {
            throw new Error('array element not initialized');
        }
        return element;
    }
    function resolveArrayElement(varName, index, context) {
        var _a, _b;
        const varInfo = ensureVariable(varName, context);
        if (varInfo.tupleElements) {
            if (index < 0 || index >= varInfo.tupleElements.length) {
                throw new Error('tuple index out of bounds');
            }
            return varInfo.tupleElements[index];
        }
        // Handle string indexing through pointer
        if (((_a = varInfo.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Ptr' && varInfo.type.pointsTo.kind === 'Str') {
            // First try to get stringValue from the variable itself (inline strings)
            if (varInfo.stringValue) {
                return resolveStringIndex(varInfo.stringValue, index);
            }
            // Otherwise try to get it from the variable it refers to
            if (varInfo.refersTo) {
                const targetVar = ensureVariable(varInfo.refersTo, context);
                if (targetVar.stringValue) {
                    return resolveStringIndex(targetVar.stringValue, index);
                }
            }
        }
        let elements = varInfo.arrayElements;
        if (!elements && ((_b = varInfo.type) === null || _b === void 0 ? void 0 : _b.kind) === 'Ptr' && varInfo.type.pointsTo.kind === 'Array') {
            const targetVar = ensureVariable(varInfo.refersTo || '', context);
            elements = targetVar.arrayElements;
        }
        if (!elements) {
            throw new Error('variable ' + varName + ' is not an array');
        }
        return resolveArrayElementFromList(elements, index);
    }
    function resolveIndexedValue(baseValue, index, context) {
        var _a, _b, _c;
        if (baseValue.tupleElements) {
            if (index < 0 || index >= baseValue.tupleElements.length) {
                throw new Error('tuple index out of bounds');
            }
            return baseValue.tupleElements[index];
        }
        if (((_a = baseValue.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Str' && baseValue.stringValue !== undefined) {
            return resolveStringIndex(baseValue.stringValue, index);
        }
        if (((_b = baseValue.type) === null || _b === void 0 ? void 0 : _b.kind) === 'Ptr' && baseValue.type.pointsTo.kind === 'Str') {
            if (baseValue.stringValue !== undefined) {
                return resolveStringIndex(baseValue.stringValue, index);
            }
            if (baseValue.refersTo) {
                const targetVar = ensureVariable(baseValue.refersTo, context);
                if (targetVar.stringValue !== undefined) {
                    return resolveStringIndex(targetVar.stringValue, index);
                }
            }
        }
        let elements = baseValue.arrayElements;
        if (!elements && ((_c = baseValue.type) === null || _c === void 0 ? void 0 : _c.kind) === 'Ptr' && baseValue.type.pointsTo.kind === 'Array') {
            const targetVar = ensureVariable(baseValue.refersTo || '', context);
            elements = targetVar.arrayElements;
        }
        if (!elements) {
            throw new Error('expression is not an array');
        }
        return resolveArrayElementFromList(elements, index);
    }
    function updateBracketDepths(ch, depths) {
        if (ch === '(')
            depths.paren++;
        if (ch === ')')
            depths.paren--;
        if (ch === '[')
            depths.bracket++;
        if (ch === ']')
            depths.bracket--;
        if (ch === '{')
            depths.brace++;
        if (ch === '}')
            depths.brace--;
    }
    function forEachCharWithDepths(input, handler) {
        const depths = { paren: 0, bracket: 0, brace: 0 };
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            updateBracketDepths(ch, depths);
            const shouldStop = handler(ch, i, depths);
            if (shouldStop) {
                break;
            }
        }
    }
    function splitTopLevelComma(input) {
        const parts = [];
        let current = '';
        forEachCharWithDepths(input, (ch, _index, depths) => {
            if (ch === ',' && depths.paren === 0 && depths.bracket === 0 && depths.brace === 0) {
                if (current.trim())
                    parts.push(current.trim());
                current = '';
                return;
            }
            current += ch;
        });
        if (current.trim())
            parts.push(current.trim());
        return parts;
    }
    function resolveTypeAlias(name, seen = new Set()) {
        if (!typeAliases.has(name))
            return undefined;
        if (seen.has(name)) {
            throw new Error('cyclic type alias: ' + name);
        }
        seen.add(name);
        const aliasInfo = typeAliases.get(name);
        if (!aliasInfo)
            return undefined;
        return aliasInfo.type;
    }
    function getAliasDropFn(name) {
        // Strip generic parameters if present (e.g., "Alloc<I32>" -> "Alloc")
        const baseName = name.replace(/<[^>]+>/, '');
        const aliasInfo = typeAliases.get(baseName);
        return aliasInfo === null || aliasInfo === void 0 ? void 0 : aliasInfo.dropFn;
    }
    function tryParseSuffix(typeStr) {
        const trimmed = typeStr.trim();
        const alias = resolveTypeAlias(trimmed);
        if (alias)
            return alias;
        if (trimmed === 'Bool')
            return { kind: 'Bool', width: 1 };
        if (trimmed === 'Void')
            return { kind: 'Void' };
        if (trimmed === 'Char')
            return { kind: 'Char' };
        if (trimmed === 'Str')
            return { kind: 'Str' };
        if (trimmed === 'This')
            return { kind: 'This' };
        if (trimmed === 'USize')
            return { kind: 'U', width: 64 };
        // Parse function pointer type with optional leading *: *?(param1, param2, ...) => returnType
        // The leading * is optional and just indicates "function pointer" explicitly
        const fnPtrMatch = trimmed.match(/^\s*\*?\s*\((.*?)\)\s*=>\s*(.+)$/);
        if (fnPtrMatch) {
            const paramsStr = fnPtrMatch[1].trim();
            const returnTypeStr = fnPtrMatch[2].trim();
            const paramTypes = [];
            if (paramsStr) {
                const paramParts = splitTopLevelComma(paramsStr);
                for (const paramPart of paramParts) {
                    let paramType;
                    const paramTrimmed = paramPart.trim();
                    // Handle pointer params like *outer where outer is assumed to be This
                    if (paramTrimmed.startsWith('*')) {
                        const pointeeStr = paramTrimmed.substring(1).trim();
                        const pointeeType = tryParseSuffix(pointeeStr);
                        if (pointeeType) {
                            paramType = { kind: 'Ptr', pointsTo: pointeeType, mutable: false };
                        }
                    }
                    else {
                        paramType = tryParseSuffix(paramTrimmed);
                    }
                    if (!paramType)
                        return undefined;
                    paramTypes.push(paramType);
                }
            }
            const returnType = tryParseSuffix(returnTypeStr);
            if (!returnType)
                return undefined;
            return { kind: 'FnPtr', paramTypes, returnType };
        }
        // Parse array type: [I32; init; length]
        const arrayMatch = typeStr.match(/^\[(.+?);\s*(\d+);\s*(\d+)\]$/);
        if (arrayMatch) {
            const elementTypeStr = arrayMatch[1].trim();
            const initializedCount = Number(arrayMatch[2]);
            const length = Number(arrayMatch[3]);
            const elementType = tryParseSuffix(elementTypeStr);
            if (!elementType)
                return undefined;
            return { kind: 'Array', elementType, length, initializedCount };
        }
        // Parse array slice type: [I32]
        const sliceMatch = typeStr.match(/^\[([^;]+)\]$/);
        if (sliceMatch) {
            const elementTypeStr = sliceMatch[1].trim();
            const elementType = tryParseSuffix(elementTypeStr);
            if (!elementType)
                return undefined;
            return { kind: 'Array', elementType, length: -1, initializedCount: -1 };
        }
        // Parse tuple type: (I32, Bool)
        const tupleMatch = typeStr.match(/^\((.*)\)$/);
        if (tupleMatch) {
            const inner = tupleMatch[1].trim();
            if (!inner)
                return undefined;
            const parts = splitTopLevelComma(inner);
            if (parts.length < 2)
                return undefined;
            const elements = [];
            for (const part of parts) {
                const elementType = tryParseSuffix(part);
                if (!elementType)
                    return undefined;
                elements.push(elementType);
            }
            return { kind: 'Tuple', elements };
        }
        const typeMatch = typeStr.match(/^([UI])(\d+)$/);
        if (typeMatch) {
            const kind = typeMatch[1];
            const width = Number(typeMatch[2]);
            return { kind, width };
        }
        // Parse generic type parameter (e.g., T, U, V)
        const genericMatch = trimmed.match(/^([A-Z][a-zA-Z0-9_]*)$/);
        if (genericMatch) {
            return { kind: 'Generic', name: genericMatch[1] };
        }
        // Lowercase identifiers (like function names) are treated as This
        // This allows `let x : outer = outer(...)` where outer returns this
        const lowercaseIdentMatch = trimmed.match(/^([a-z][a-zA-Z0-9_]*)$/);
        if (lowercaseIdentMatch) {
            return { kind: 'This' };
        }
        return undefined;
    }
    function parsePointerSuffix(typeStr, mutable) {
        const pointeeSuffix = tryParseSuffix(typeStr);
        if (!pointeeSuffix || pointeeSuffix.kind === 'Void') {
            return undefined;
        }
        return { kind: 'Ptr', pointsTo: pointeeSuffix, mutable };
    }
    function parseStructFieldType(typeExpression) {
        const trimmed = typeExpression.trim();
        if (trimmed === 'Bool')
            return { kind: 'Bool', width: 1 };
        if (trimmed === 'Void')
            return { kind: 'Void' };
        if (trimmed.startsWith('*mut ')) {
            return parsePointerSuffix(trimmed.substring(5).trim(), true);
        }
        if (trimmed.startsWith('*')) {
            return parsePointerSuffix(trimmed.substring(1).trim(), false);
        }
        return tryParseSuffix(trimmed);
    }
    function buildThisValue(context) {
        const fields = new Map();
        for (const [key, value] of context) {
            if (!value.initialized) {
                continue;
            }
            fields.set(key, snapshotRuntimeValue(value));
        }
        return { value: 0, type: { kind: 'This' }, structName: 'This', structFields: fields };
    }
    function snapshotRuntimeValue(value) {
        return {
            value: value.value,
            type: value.type,
            refersTo: value.refersTo,
            refersToFn: value.refersToFn,
            boundThis: value.boundThis,
            boundThisRef: value.boundThisRef,
            boundThisFieldKeys: value.boundThisFieldKeys,
            structName: value.structName,
            structFields: value.structFields,
            arrayElements: value.arrayElements,
            arrayInitializedCount: value.arrayInitializedCount,
            tupleElements: value.tupleElements,
            maxValue: value.maxValue,
            mutable: value.mutable,
            initialized: value.initialized,
        };
    }
    function snapshotContextValue(value) {
        var _a, _b;
        return {
            ...snapshotRuntimeValue(value),
            mutable: (_a = value.mutable) !== null && _a !== void 0 ? _a : false,
            initialized: (_b = value.initialized) !== null && _b !== void 0 ? _b : true,
        };
    }
    function buildContextFromThisValue(baseValue, context) {
        const derived = new Map(context);
        if (!baseValue.structFields) {
            return derived;
        }
        for (const [key, value] of baseValue.structFields) {
            derived.set(key, snapshotContextValue(value));
        }
        // Store a marker so we know this context came from a boundThis
        derived.set('$boundThis', snapshotContextValue(baseValue));
        return derived;
    }
    function updateThisFieldsInContext(targetName, fieldKeys, sourceContext, targetContext) {
        var _a;
        const targetVar = targetContext.get(targetName);
        if (((_a = targetVar === null || targetVar === void 0 ? void 0 : targetVar.type) === null || _a === void 0 ? void 0 : _a.kind) === 'This' && targetVar.structFields) {
            const updatedFields = new Map(targetVar.structFields);
            for (const key of fieldKeys) {
                const updatedValue = sourceContext.get(key);
                if (updatedValue) {
                    updatedFields.set(key, snapshotRuntimeValue(updatedValue));
                }
            }
            targetContext.set(targetName, { ...targetVar, structFields: updatedFields });
        }
    }
    function buildThisFunctionValue(baseValue, fieldName, functions, bound = false) {
        var _a;
        if (((_a = baseValue.type) === null || _a === void 0 ? void 0 : _a.kind) !== 'This') {
            return null;
        }
        if (!functions.has(fieldName)) {
            return null;
        }
        const fnValue = buildFunctionPointerValue(fieldName, functions);
        if (bound) {
            const keys = baseValue.structFields ? Array.from(baseValue.structFields.keys()) : [];
            return {
                ...fnValue,
                boundThis: snapshotRuntimeValue(baseValue),
                boundThisFieldKeys: keys,
            };
        }
        return fnValue;
    }
    function buildBoundThisFunctionValue(baseValue, fieldName, functions, boundThisRef) {
        const fnValue = buildThisFunctionValue(baseValue, fieldName, functions, true);
        if (!fnValue)
            return null;
        if (boundThisRef) {
            return { ...fnValue, boundThisRef };
        }
        return fnValue;
    }
    function buildUnboundFunctionPointerValue(baseValue, fieldName, functions) {
        return buildThisFunctionValue(baseValue, fieldName, functions, false);
    }
    function evaluateAssignmentValue(currentValue, op, rhs, context, functions, structs) {
        var _a;
        let valueToAssign = rhs;
        if (op !== '=') {
            valueToAssign = currentValue + op[0] + ' ' + rhs;
        }
        const newValueObj = processExprWithContext(valueToAssign, context, functions, structs);
        if (((_a = newValueObj.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Bool') {
            throw new Error('cannot perform arithmetic on booleans');
        }
        return newValueObj;
    }
    function splitStructArgs(argStr) {
        const parts = [];
        let current = '';
        let depth = 0;
        for (let i = 0; i < argStr.length; i++) {
            const ch = argStr[i];
            if ((ch === '(' || ch === '{' || ch === '[') && depth >= 0) {
                depth++;
                current += ch;
                continue;
            }
            if ((ch === ')' || ch === '}' || ch === ']') && depth > 0) {
                depth--;
                current += ch;
                continue;
            }
            if ((ch === ';' || ch === ',') && depth === 0) {
                if (current.trim()) {
                    parts.push(current.trim());
                }
                current = '';
                continue;
            }
            current += ch;
        }
        if (current.trim()) {
            parts.push(current.trim());
        }
        if (!parts.length && argStr.trim()) {
            parts.push(argStr.trim());
        }
        return parts;
    }
    // helper to evaluate an expression with optional variable context
    function resolveOperand(token, context, functions, structs) {
        var _a;
        if (token === 'true' || token === 'false') {
            return parseLiteralToken(token);
        }
        if (token === 'this' && !context.has('this')) {
            return buildThisValue(context);
        }
        const fieldAccessMatch = token.match(/^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)$/);
        if (fieldAccessMatch) {
            return processExprWithContext(token, context, functions, structs);
        }
        const arrayIndexTokenMatch = token.match(/^([a-zA-Z_]\w*)\s*\[\s*([+-]?\d+)\s*\]$/);
        if (arrayIndexTokenMatch) {
            const varName = arrayIndexTokenMatch[1];
            const index = Number(arrayIndexTokenMatch[2]);
            return resolveArrayElement(varName, index, context);
        }
        // Handle dereference operator
        if (token.startsWith('*')) {
            const ptrVar = ensurePointer(token.substring(1), context);
            const pointedVar = ensureVariable(ptrVar.refersTo, context);
            return {
                value: pointedVar.value,
                type: ptrVar.type.pointsTo,
            };
        }
        // Handle mutable reference operator
        if (token.startsWith('&mut ')) {
            const varName = token.substring(5).trim();
            if (varName === 'this') {
                // Special case: &mut this creates a mutable reference to the current scope
                return {
                    value: 0, // value is not used for pointers
                    type: { kind: 'Ptr', pointsTo: { kind: 'This' }, mutable: true },
                    refersTo: '$thisScope',
                };
            }
            const var_ = ensureVariable(varName, context);
            if (!var_.mutable) {
                throw new Error('cannot take mutable reference to immutable variable');
            }
            // Check for existing mutable borrow to the same variable
            for (const [, ptrVar] of context) {
                if (((_a = ptrVar.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Ptr' && ptrVar.refersTo === varName && ptrVar.type.mutable) {
                    throw new Error('cannot have multiple mutable references to the same variable');
                }
            }
            return {
                value: 0, // value is not used for pointers
                type: { kind: 'Ptr', pointsTo: var_.type || { kind: 'I', width: 32 }, mutable: true },
                refersTo: varName,
            };
        }
        // Handle immutable reference operator
        if (token.startsWith('&')) {
            const refTarget = token.substring(1);
            if (refTarget === 'this') {
                // Special case: &this creates a reference to the current scope
                return {
                    value: 0, // value is not used for pointers
                    type: { kind: 'Ptr', pointsTo: { kind: 'This' }, mutable: false },
                    refersTo: '$thisScope',
                };
            }
            const var_ = ensureVariable(refTarget, context);
            return {
                value: 0, // value is not used for pointers
                type: { kind: 'Ptr', pointsTo: var_.type || { kind: 'I', width: 32 }, mutable: false },
                refersTo: refTarget,
            };
        }
        if (/^[a-zA-Z_]/.test(token)) {
            // variable reference
            if (!context.has(token)) {
                if (functions.has(token)) {
                    return buildFunctionPointerValue(token, functions);
                }
                throw new Error('undefined variable: ' + token);
            }
            return context.get(token);
        }
        // literal
        return parseLiteralToken(token);
    }
    function evaluateExpression(expr, context = new Map(), functions, structs) {
        var _a;
        const tokens = expr.match(/true|false|"[^"]*"|'.'|(&mut\s+[a-zA-Z_]\w*)|([&*][a-zA-Z_]\w*)|([a-zA-Z_]\w*\s*\[\s*[+-]?\d+\s*\])|([+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)|(\bis\b|\|\||&&|==|!=|<=|>=|[+\-*/<>])|([a-zA-Z_]\w*(?:\s*\.\s*[a-zA-Z_]\w*)*)/g);
        if (!tokens || tokens.length === 0) {
            throw new Error('invalid expression');
        }
        if (tokens.length === 1) {
            // single operand (literal or variable)
            return resolveOperand(tokens[0], context, functions, structs);
        }
        if (tokens.length < 3 || tokens.length % 2 === 0) {
            throw new Error('invalid expression');
        }
        const operands = [];
        const operators = [];
        // extract operators first to check if they are all logical
        for (let i = 1; i < tokens.length; i += 2) {
            operators.push(tokens[i]);
        }
        const originalOperators = [...operators];
        const hasArithmeticOps = operators.some((op) => ['+', '-', '*', '/'].includes(op));
        const getPrevOperator = (tokenIndex, ops) => {
            const operatorIndex = tokenIndex / 2 - 1;
            return operatorIndex >= 0 ? ops[operatorIndex] : undefined;
        };
        for (let i = 0; i < tokens.length; i += 2) {
            // even indices are operands (literals or variables)
            const prevOp = getPrevOperator(i, operators);
            if (prevOp === 'is') {
                const typeToken = tokens[i].trim();
                const typeSuffix = tryParseSuffix(typeToken);
                if (!typeSuffix) {
                    throw new Error('invalid type in is expression');
                }
                operands.push({ value: 0, type: typeSuffix });
                continue;
            }
            const opResult = resolveOperand(tokens[i], context, functions, structs);
            if (opResult.structFields) {
                throw new Error('cannot use struct value in expression');
            }
            if (tokens.length > 1 && ((_a = opResult.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Bool' && hasArithmeticOps) {
                throw new Error('cannot perform arithmetic on booleans');
            }
            operands.push(opResult);
        }
        // Helper to apply operators of a certain precedence
        function applyPass(ops, handler) {
            const targetOps = new Set(ops);
            for (let i = 0; i < operators.length; i++) {
                if (targetOps.has(operators[i])) {
                    const res = handler(operands[i], operators[i], operands[i + 1]);
                    if (typeof res === 'number') {
                        operands[i] = { value: res };
                    }
                    else {
                        operands[i] = res;
                    }
                    operands.splice(i + 1, 1);
                    operators.splice(i, 1);
                    i--;
                }
            }
        }
        // Helper to validate operand types for comparison/equality
        function validateComparable(left, right, isEquality) {
            var _a, _b;
            const leftKind = ((_a = left.type) === null || _a === void 0 ? void 0 : _a.kind) || 'Numeric';
            const rightKind = ((_b = right.type) === null || _b === void 0 ? void 0 : _b.kind) || 'Numeric';
            if ((leftKind === 'Bool') !== (rightKind === 'Bool')) {
                throw new Error('cannot compare different types');
            }
            if (!isEquality && leftKind === 'Bool') {
                throw new Error('cannot compare different types');
            }
        }
        // first pass: handle multiplication and division (higher precedence)
        applyPass(['*', '/'], (left, op, right) => {
            if (op === '/' && right.value === 0) {
                throw new Error('division by zero');
            }
            return op === '*' ? left.value * right.value : left.value / right.value;
        });
        // second pass: handle addition and subtraction (left to right)
        applyPass(['+', '-'], (left, op, right) => {
            return op === '+' ? left.value + right.value : left.value - right.value;
        });
        // third pass: handle comparison operators (<, <=, >, >=)
        let isBooleanResult = false;
        applyPass(['<', '<=', '>', '>='], (left, op, right) => {
            validateComparable(left, right, false);
            isBooleanResult = true;
            let res = false;
            if (op === '<')
                res = left.value < right.value;
            else if (op === '<=')
                res = left.value <= right.value;
            else if (op === '>')
                res = left.value > right.value;
            else if (op === '>=')
                res = left.value >= right.value;
            return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
        });
        // fourth pass: handle type checks (is)
        applyPass(['is'], (left, _op, right) => {
            const leftType = left.type || { kind: 'I', width: 32 };
            const rightType = right.type;
            if (!rightType) {
                throw new Error('invalid type in is expression');
            }
            isBooleanResult = true;
            const res = typeEqualsForValidation(leftType, rightType);
            return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
        });
        // fifth pass: handle equality operators (==, !=)
        applyPass(['==', '!='], (left, op, right) => {
            var _a, _b;
            validateComparable(left, right, true);
            isBooleanResult = true;
            let res;
            // For pointer comparisons, check refersTo for identity
            if (((_a = left.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Ptr' && ((_b = right.type) === null || _b === void 0 ? void 0 : _b.kind) === 'Ptr') {
                res = left.refersTo === right.refersTo;
            }
            else {
                res = left.value === right.value;
            }
            if (op === '!=')
                res = !res;
            return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
        });
        // Helper to handle logical operators
        function applyLogicalPass(opStr) {
            applyPass([opStr], (left, op, right) => {
                var _a, _b;
                if (((_a = left.type) === null || _a === void 0 ? void 0 : _a.kind) !== 'Bool' || ((_b = right.type) === null || _b === void 0 ? void 0 : _b.kind) !== 'Bool') {
                    throw new Error('logical operators only supported for booleans');
                }
                isBooleanResult = true;
                const res = op === '&&' ? left.value !== 0 && right.value !== 0 : left.value !== 0 || right.value !== 0;
                return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
            });
        }
        // fifth pass: handle logical AND (&&)
        applyLogicalPass('&&');
        // sixth pass: handle logical OR (||)
        applyLogicalPass('||');
        const finalResult = operands[0].value;
        const finalSuffix = operands[0].type;
        // find the widest suffix among all original operands (if any)
        let widestSuffix;
        for (let i = 0; i < tokens.length; i += 2) {
            const prevOp = getPrevOperator(i, originalOperators);
            if (prevOp === 'is') {
                continue;
            }
            const op = resolveOperand(tokens[i], context, functions, structs);
            if (op.type &&
                op.type.kind !== 'Bool' &&
                op.type.kind !== 'Ptr' &&
                (!widestSuffix || ('width' in op.type && 'width' in widestSuffix && op.type.width > widestSuffix.width))) {
                widestSuffix = op.type;
            }
        }
        // validate against the widest type if it's not a boolean result and it's numeric
        if (widestSuffix && !isBooleanResult && 'width' in widestSuffix) {
            validateValueAgainstSuffix(finalResult, widestSuffix.kind, widestSuffix.width);
        }
        return { value: finalResult, type: finalSuffix || widestSuffix };
    }
    function evaluateStructLiteralAccess(expr, context, functions, structs) {
        var _a;
        const trimmed = expr.trim();
        const structRegex = /^([a-zA-Z_]\w*)(?:\s*<\s*([^>]+)\s*>)?\s*\{\s*([\s\S]*?)\s*\}\s*(?:\.\s*([a-zA-Z_]\w*))?$/;
        const match = trimmed.match(structRegex);
        if (!match)
            return null;
        const structName = match[1];
        const typeArgsStr = match[2];
        const argsBody = match[3];
        const memberName = match[4];
        const structDef = structs.get(structName);
        if (!structDef)
            throw new Error('struct not defined: ' + structName);
        // Parse type arguments and create a type parameter substitution map
        const typeSubstitution = new Map();
        if (typeArgsStr) {
            const typeArgs = typeArgsStr.split(',').map((s) => s.trim());
            if (!structDef.typeParams || typeArgs.length !== structDef.typeParams.length) {
                throw new Error('struct ' + structName + ' expects ' + (((_a = structDef.typeParams) === null || _a === void 0 ? void 0 : _a.length) || 0) + ' type arguments');
            }
            for (let i = 0; i < typeArgs.length; i++) {
                const typeArg = parseStructFieldType(typeArgs[i]);
                if (!typeArg)
                    throw new Error('invalid type argument: ' + typeArgs[i]);
                typeSubstitution.set(structDef.typeParams[i], typeArg);
            }
        }
        else if (structDef.typeParams && structDef.typeParams.length > 0) {
            throw new Error('struct ' + structName + ' requires type arguments');
        }
        const argParts = splitStructArgs(argsBody);
        if (argParts.length !== structDef.fields.length) {
            throw new Error('struct ' + structName + ' expects ' + structDef.fields.length + ' values, got ' + argParts.length);
        }
        const fieldValues = new Map();
        for (let i = 0; i < structDef.fields.length; i++) {
            const fieldDef = structDef.fields[i];
            const exprPart = argParts[i];
            const fieldValue = processExprWithContext(exprPart, context, functions, structs);
            // Resolve field type with generic substitution
            let resolvedFieldType = fieldDef.type;
            if (fieldDef.type.kind === 'Generic' && typeSubstitution.has(fieldDef.type.name)) {
                resolvedFieldType = typeSubstitution.get(fieldDef.type.name);
            }
            validateNarrowing(fieldValue.type, resolvedFieldType);
            if (resolvedFieldType.kind !== 'Ptr' && resolvedFieldType.kind !== 'Void' && 'width' in resolvedFieldType) {
                validateValueAgainstSuffix(fieldValue.value, resolvedFieldType.kind, resolvedFieldType.width);
            }
            fieldValues.set(fieldDef.name, fieldValue);
        }
        if (memberName) {
            const memberValue = fieldValues.get(memberName);
            if (!memberValue) {
                throw new Error('struct ' + structName + ' has no field: ' + memberName);
            }
            return memberValue;
        }
        return {
            value: 0,
            structName,
            structFields: fieldValues,
        };
    }
    function evaluateIfExpression(expr, context, _functions, structs) {
        var _a;
        const trimmed = expr.trim();
        if (!trimmed.startsWith('if')) {
            return null;
        }
        let cursor = 2;
        while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) {
            cursor++;
        }
        if (cursor >= trimmed.length || trimmed[cursor] !== '(') {
            throw new Error('expected "(" after "if"');
        }
        let conditionStart = cursor + 1;
        let depth = 1;
        let conditionEnd = -1;
        for (let i = conditionStart; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (ch === '(') {
                depth++;
            }
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    conditionEnd = i;
                    break;
                }
            }
        }
        if (conditionEnd === -1) {
            throw new Error('condition missing closing parenthesis');
        }
        const conditionExpr = trimmed.substring(conditionStart, conditionEnd).trim();
        if (!conditionExpr) {
            throw new Error('if condition cannot be empty');
        }
        const isIdentifierChar = (ch) => ch !== undefined && /[A-Za-z0-9_]/.test(ch);
        let depthParen = 0;
        let depthBrace = 0;
        let pendingIfs = 0;
        let elseIndex = -1;
        for (let i = conditionEnd + 1; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (ch === '(') {
                depthParen++;
                continue;
            }
            if (ch === ')') {
                if (depthParen > 0)
                    depthParen--;
                continue;
            }
            if (ch === '{') {
                depthBrace++;
                continue;
            }
            if (ch === '}') {
                if (depthBrace > 0)
                    depthBrace--;
                continue;
            }
            if (depthParen === 0 && depthBrace === 0) {
                if (trimmed.startsWith('if', i) && !isIdentifierChar(trimmed[i - 1]) && !isIdentifierChar(trimmed[i + 2])) {
                    pendingIfs++;
                    i += 1;
                    continue;
                }
                if (trimmed.startsWith('else', i) && !isIdentifierChar(trimmed[i - 1]) && !isIdentifierChar(trimmed[i + 4])) {
                    if (pendingIfs > 0) {
                        pendingIfs--;
                        i += 3;
                        continue;
                    }
                    elseIndex = i;
                    break;
                }
            }
        }
        if (elseIndex === -1) {
            throw new Error('else keyword missing');
        }
        const trueBranch = trimmed.substring(conditionEnd + 1, elseIndex).trim();
        if (!trueBranch) {
            throw new Error('if true branch cannot be empty');
        }
        const falseBranch = trimmed.substring(elseIndex + 4).trim();
        if (!falseBranch) {
            throw new Error('if false branch cannot be empty');
        }
        const conditionResult = processExprWithContext(conditionExpr, context, _functions, structs);
        if (((_a = conditionResult.type) === null || _a === void 0 ? void 0 : _a.kind) !== 'Bool') {
            throw new Error('if condition must be boolean');
        }
        const trueResult = processExprWithContext(trueBranch, context, _functions, structs);
        const falseResult = processExprWithContext(falseBranch, context, _functions, structs);
        const normalizedSuffix = (res) => res.type || { kind: 'I', width: 32 };
        const trueSuffix = normalizedSuffix(trueResult);
        const falseSuffix = normalizedSuffix(falseResult);
        if (trueSuffix.kind !== falseSuffix.kind) {
            throw new Error('if branches must match types');
        }
        return conditionResult.value !== 0 ? trueResult : falseResult;
    }
    // Helper to merge block context changes back to parent context
    function mergeBlockContext(blockResult, parentContext) {
        for (const [key, value] of blockResult.context) {
            if (!blockResult.declaredInThisBlock.has(key) && parentContext.has(key)) {
                parentContext.set(key, value);
            }
        }
    }
    function splitTypeAndInitializer(input) {
        let result;
        forEachCharWithDepths(input, (ch, index, depths) => {
            if (ch === '=' && depths.paren === 0 && depths.bracket === 0 && depths.brace === 0) {
                if (index + 1 < input.length && input[index + 1] === '>') {
                    return;
                }
                result = {
                    typePart: input.substring(0, index).trim(),
                    exprPart: input.substring(index + 1).trim(),
                };
                return true;
            }
        });
        if (result) {
            return result;
        }
        return { typePart: input.trim() };
    }
    function parseLetStatement(stmt) {
        const trimmed = stmt.trim();
        if (!trimmed.startsWith('let ')) {
            throw new Error('invalid let statement');
        }
        let rest = trimmed.substring(4).trim();
        let isMutable = false;
        if (rest.startsWith('mut ')) {
            isMutable = true;
            rest = rest.substring(4).trim();
        }
        const nameMatch = rest.match(/^([a-zA-Z_]\w*)/);
        if (!nameMatch) {
            throw new Error('invalid let statement');
        }
        const varName = nameMatch[1];
        rest = rest.substring(nameMatch[0].length).trim();
        let varType;
        let varExprStr;
        if (rest.startsWith(':')) {
            rest = rest.substring(1).trim();
            const split = splitTypeAndInitializer(rest);
            varType = split.typePart || undefined;
            if (split.exprPart !== undefined) {
                varExprStr = split.exprPart.trim();
            }
        }
        else if (rest.startsWith('=')) {
            varExprStr = rest.substring(1).trim();
        }
        else if (rest.length > 0) {
            throw new Error('invalid let statement');
        }
        return { isMutable, varName, varType, varExprStr };
    }
    function splitFunctionHeaderAndBody(input) {
        let result;
        forEachCharWithDepths(input, (ch, index, depths) => {
            if (ch === '=' && index + 1 < input.length && input[index + 1] === '>') {
                if (depths.paren === 0 && depths.bracket === 0 && depths.brace === 0) {
                    result = {
                        header: input.substring(0, index).trim(),
                        body: input.substring(index + 2).trim(),
                    };
                }
            }
        });
        if (!result) {
            throw new Error('invalid function definition');
        }
        return result;
    }
    function parseFunctionDefinition(stmt) {
        var _a;
        const { header, body } = splitFunctionHeaderAndBody(stmt);
        const headerMatch = header.match(/^fn\s+([a-zA-Z_]\w*)\s*(?:<\s*([^>]+)\s*>)?\s*\(\s*(.*?)\s*\)\s*(?::\s*(.+))?$/);
        if (!headerMatch) {
            throw new Error('invalid function definition');
        }
        return {
            name: headerMatch[1],
            genericsRaw: headerMatch[2],
            paramsStr: headerMatch[3],
            returnTypeRaw: (_a = headerMatch[4]) === null || _a === void 0 ? void 0 : _a.trim(),
            body,
        };
    }
    function parseTrailingCall(expr) {
        const trimmed = expr.trim();
        if (!trimmed.endsWith(')'))
            return null;
        let depth = 0;
        for (let i = trimmed.length - 1; i >= 0; i--) {
            const ch = trimmed[i];
            if (ch === ')') {
                depth++;
                continue;
            }
            if (ch === '(') {
                depth--;
                if (depth === 0) {
                    const calleeExpr = trimmed.substring(0, i).trim();
                    const argsStr = trimmed.substring(i + 1, trimmed.length - 1).trim();
                    if (!calleeExpr)
                        return null;
                    return { calleeExpr, argsStr };
                }
            }
        }
        return null;
    }
    function evaluateNonVoidExpression(expr, context, functions, structs) {
        var _a;
        const valueObj = processExprWithContext(expr, context, functions, structs);
        if (((_a = valueObj.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Void') {
            throw new Error('void function cannot return a value');
        }
        return valueObj;
    }
    // Helper to execute a function call with given arguments
    function executeFunctionCall(fnName, argsStr, context, functions, structs, explicitTypeArgs) {
        const args = parseCallArguments(argsStr, context, functions, structs);
        return executeFunctionCallWithArgs(fnName, args, context, functions, structs, explicitTypeArgs);
    }
    function parseCallArguments(argsStr, context, functions, structs) {
        const args = [];
        if (!argsStr.trim()) {
            return args;
        }
        const argParts = splitTopLevelComma(argsStr);
        for (const argPart of argParts) {
            const argValue = processExprWithContext(argPart, context, functions, structs);
            args.push(argValue);
        }
        return args;
    }
    function parseExplicitTypeArgs(typeArgsStr) {
        if (!typeArgsStr)
            return undefined;
        const parts = splitTopLevelComma(typeArgsStr);
        const types = [];
        for (const part of parts) {
            const parsed = tryParseSuffix(part.trim());
            if (!parsed) {
                throw new Error('invalid type argument: ' + part.trim());
            }
            types.push(parsed);
        }
        return types.length ? types : undefined;
    }
    function executeFunctionCallWithArgs(fnName, args, context, functions, structs, explicitTypeArgs) {
        var _a, _b, _c;
        const fnDef = functions.get(fnName);
        if (!fnDef) {
            const nativeFn = currentNativeFunctions === null || currentNativeFunctions === void 0 ? void 0 : currentNativeFunctions.get(fnName);
            if (nativeFn) {
                const returnTypeStr = currentNativeFunctionReturnTypes === null || currentNativeFunctionReturnTypes === void 0 ? void 0 : currentNativeFunctionReturnTypes.get(fnName);
                return executeNativeFunction(nativeFn, args, context, explicitTypeArgs, returnTypeStr);
            }
            throw new Error(buildFunctionNotFoundMessage(fnName, 'function call ' + fnName + '(...)'));
        }
        // Handle closure-style calls: if we have one extra argument that's a *This pointer,
        // use it to derive the context for the call
        let effectiveArgs = args;
        let derivedContext = context;
        let thisBindingName;
        let thisBindingFieldKeys;
        if (args.length === fnDef.params.length + 1 && ((_a = args[0].type) === null || _a === void 0 ? void 0 : _a.kind) === 'Ptr' && args[0].type.pointsTo.kind === 'This') {
            // The first arg is a pointer to This - use its target as context
            const ptrArg = args[0];
            if (ptrArg.refersTo) {
                const targetVar = context.get(ptrArg.refersTo);
                if (((_b = targetVar === null || targetVar === void 0 ? void 0 : targetVar.type) === null || _b === void 0 ? void 0 : _b.kind) === 'This' && targetVar.structFields) {
                    derivedContext = buildContextFromThisValue(targetVar, context);
                    thisBindingName = ptrArg.refersTo;
                    thisBindingFieldKeys = Array.from(targetVar.structFields.keys());
                }
            }
            effectiveArgs = args.slice(1);
        }
        if (effectiveArgs.length !== fnDef.params.length) {
            throw new Error('function ' + fnName + ' expects ' + fnDef.params.length + ' arguments, got ' + effectiveArgs.length);
        }
        const genericMap = new Map();
        const resolveGenericType = (type, argValue) => {
            if (type.kind === 'Generic') {
                const existing = genericMap.get(type.name);
                if (existing)
                    return existing;
                const inferred = (argValue === null || argValue === void 0 ? void 0 : argValue.type) || { kind: 'I', width: 32 };
                genericMap.set(type.name, inferred);
                return inferred;
            }
            return type;
        };
        const fnContext = new Map(derivedContext);
        for (let i = 0; i < fnDef.params.length; i++) {
            const param = fnDef.params[i];
            const arg = effectiveArgs[i];
            const resolvedParamType = resolveGenericType(param.type, arg);
            validateNarrowing(arg.type, resolvedParamType);
            if (resolvedParamType.kind !== 'Ptr' && 'width' in resolvedParamType) {
                validateValueAgainstSuffix(arg.value, resolvedParamType.kind, resolvedParamType.width);
            }
            fnContext.set(param.name, {
                value: arg.value,
                type: resolvedParamType,
                mutable: false,
                initialized: true,
                refersTo: arg.refersTo,
                structName: arg.structName,
                structFields: arg.structFields,
                arrayElements: arg.arrayElements,
                arrayInitializedCount: arg.arrayInitializedCount,
            });
        }
        let bodyContent = fnDef.body;
        if (bodyContent.startsWith('{') && bodyContent.endsWith('}')) {
            bodyContent = bodyContent.substring(1, bodyContent.length - 1);
        }
        const bodyResult = processBlock(bodyContent, fnContext, functions, structs);
        const returnValue = bodyResult.result;
        mergeBlockContext(bodyResult, context);
        if (thisBindingName && thisBindingFieldKeys) {
            updateThisFieldsInContext(thisBindingName, thisBindingFieldKeys, derivedContext, context);
        }
        let resolvedReturnType = fnDef.returnType;
        if (resolvedReturnType && resolvedReturnType.kind === 'Generic') {
            resolvedReturnType = genericMap.get(resolvedReturnType.name);
        }
        if (!resolvedReturnType && !bodyResult.hasTrailingExpression) {
            resolvedReturnType = { kind: 'Void' };
        }
        if (resolvedReturnType) {
            if (((_c = returnValue.type) === null || _c === void 0 ? void 0 : _c.kind) === 'Bool' && resolvedReturnType.kind !== 'Bool') {
                throw new Error('cannot return boolean value from non-bool function');
            }
            validateNarrowing(returnValue.type, resolvedReturnType);
            if (resolvedReturnType.kind !== 'Ptr' && resolvedReturnType.kind !== 'Void' && 'width' in resolvedReturnType) {
                validateValueAgainstSuffix(returnValue.value, resolvedReturnType.kind, resolvedReturnType.width);
            }
        }
        return {
            value: returnValue.value,
            type: resolvedReturnType || returnValue.type,
            refersTo: returnValue.refersTo,
            refersToFn: returnValue.refersToFn,
            structName: returnValue.structName,
            structFields: returnValue.structFields,
            arrayElements: returnValue.arrayElements,
            arrayInitializedCount: returnValue.arrayInitializedCount,
            tupleElements: returnValue.tupleElements,
            maxValue: returnValue.maxValue,
        };
    }
    function inferTypeFromValue(value) {
        if (typeof value === 'boolean') {
            return { kind: 'Bool', width: 1 };
        }
        if (typeof value === 'number') {
            return { kind: 'I', width: 32 };
        }
        if (typeof value === 'string') {
            return { kind: 'Str' };
        }
        if (Array.isArray(value)) {
            const elementType = value.length > 0 ? inferTypeFromValue(value[0]) : { kind: 'I', width: 32 };
            return {
                kind: 'Array',
                elementType,
                length: value.length,
                initializedCount: value.length,
            };
        }
        // Default to I32 for unknown types
        return { kind: 'I', width: 32 };
    }
    function executeNativeFunction(nativeFn, args, context, explicitTypeArgs, returnTypeStr) {
        var _a;
        // Convert RuntimeValue args to plain JS values
        const jsArgs = args.map((arg) => arg.value);
        // Call the actual native function
        let result;
        try {
            result = nativeFn.fn(...jsArgs);
        }
        catch (err) {
            throw new Error('native function execution failed: ' + err.message);
        }
        // Handle array results
        if (Array.isArray(result)) {
            const pointerIsMutable = (_a = returnTypeStr === null || returnTypeStr === void 0 ? void 0 : returnTypeStr.startsWith('*mut ')) !== null && _a !== void 0 ? _a : false;
            // Determine element type from explicit type args, array contents, or default
            let elementType;
            if (explicitTypeArgs && explicitTypeArgs.length > 0) {
                elementType = explicitTypeArgs[0];
            }
            else if (result.length > 0) {
                elementType = inferTypeFromValue(result[0]);
            }
            else {
                elementType = { kind: 'I', width: 32 };
            }
            // For arrays from native code, uninitialized slots should be undefined.
            // Only wrap values that are not undefined.
            const elements = result.map((v) => (v !== undefined ? { value: v, type: inferTypeFromValue(v) } : undefined));
            const initializedCount = result.filter((v) => v !== undefined).length;
            const arrayType = {
                kind: 'Array',
                elementType,
                length: result.length,
                initializedCount,
            };
            // Store array in context
            const arrayName = '$native_array_' + nativeArrayCounter++;
            context.set(arrayName, {
                value: 0,
                type: arrayType,
                mutable: pointerIsMutable,
                initialized: true,
                arrayElements: elements,
                arrayInitializedCount: initializedCount,
            });
            return {
                value: 0,
                type: { kind: 'Ptr', pointsTo: arrayType, mutable: pointerIsMutable },
                refersTo: arrayName,
            };
        }
        // Handle non-array results
        const resultType = inferTypeFromValue(result);
        const numericValue = typeof result === 'number' ? result : 0;
        const stringValue = typeof result === 'string' ? result : undefined;
        return {
            value: numericValue,
            type: resultType,
            stringValue,
        };
    }
    // Helper to process an expression recursively through brackets and let blocks
    function processExprWithContext(expr, context, functions, structs) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const structResult = evaluateStructLiteralAccess(expr, context, functions, structs);
        if (structResult) {
            return structResult;
        }
        const ifResult = evaluateIfExpression(expr, context, functions, structs);
        if (ifResult !== null) {
            return ifResult;
        }
        // Check for tuple literal: (expr1, expr2, ...)
        const trimmedExpr = expr.trim();
        if (trimmedExpr.startsWith('(') && trimmedExpr.endsWith(')')) {
            const inner = trimmedExpr.substring(1, trimmedExpr.length - 1);
            const parts = splitTopLevelComma(inner);
            if (parts.length > 1) {
                const tupleElements = [];
                const elementTypes = [];
                for (const part of parts) {
                    const elementValue = processExprWithContext(part, context, functions, structs);
                    tupleElements.push(elementValue);
                    elementTypes.push(elementValue.type || { kind: 'I', width: 32 });
                }
                return {
                    value: 0,
                    tupleElements,
                    type: { kind: 'Tuple', elements: elementTypes },
                };
            }
        }
        if (trimmedExpr.startsWith('{')) {
            let depth = 0;
            let closePos = -1;
            for (let i = 0; i < trimmedExpr.length; i++) {
                if (trimmedExpr[i] === '{') {
                    depth++;
                }
                else if (trimmedExpr[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        closePos = i;
                        break;
                    }
                }
            }
            if (closePos === trimmedExpr.length - 1 && depth === 0) {
                const blockContent = trimmedExpr.substring(1, closePos);
                const blockResult = processBlock(blockContent, context, functions, structs);
                mergeBlockContext(blockResult, context);
                return blockResult.result;
            }
        }
        // Check for array indexing on array literals: [..][index]
        const arrayIndexRegex = /^(.+)\s*\[\s*([+-]?\d+)\s*\]$/;
        const arrayIndexMatch = expr.trim().match(arrayIndexRegex);
        if (arrayIndexMatch) {
            const baseExpr = arrayIndexMatch[1].trim();
            const index = Number(arrayIndexMatch[2]);
            if (!baseExpr) {
                throw new Error('invalid array access');
            }
            if (baseExpr.startsWith('[') || baseExpr.startsWith('(') || baseExpr.endsWith(')')) {
                const baseValue = processExprWithContext(baseExpr, context, functions, structs);
                return resolveIndexedValue(baseValue, index, context);
            }
        }
        // Check for array literal: [elem1, elem2, ...]
        const arrayLiteralRegex = /^\[\s*(.*?)\s*\]$/;
        const arrayLitMatch = expr.trim().match(arrayLiteralRegex);
        if (arrayLitMatch) {
            const elementsStr = arrayLitMatch[1];
            if (!elementsStr) {
                throw new Error('empty array literal');
            }
            const elements = [];
            const elemParts = elementsStr.split(',').map((e) => e.trim());
            for (const elemPart of elemParts) {
                const elemVal = processExprWithContext(elemPart, context, functions, structs);
                elements.push(elemVal);
            }
            // Infer element type from first element
            let elementType = ((_a = elements[0]) === null || _a === void 0 ? void 0 : _a.type) || { kind: 'I', width: 32 };
            // Return array as object with arrayElements and array suffix
            return {
                value: 0,
                arrayElements: elements,
                arrayInitializedCount: elements.length,
                type: {
                    kind: 'Array',
                    elementType,
                    length: elements.length,
                    initializedCount: elements.length,
                },
            };
        }
        // Helper to evaluate .length property on values
        function evaluateLengthProperty(value, valueContext) {
            var _a, _b, _c;
            const buildLengthResult = (len) => {
                return { value: len, type: { kind: 'U', width: 64 } };
            };
            if (((_a = value.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Str' && value.stringValue !== undefined) {
                return buildLengthResult(value.stringValue.length);
            }
            if (((_b = value.type) === null || _b === void 0 ? void 0 : _b.kind) === 'Ptr' && value.type.pointsTo.kind === 'Str') {
                if (value.stringValue !== undefined) {
                    return buildLengthResult(value.stringValue.length);
                }
                if (value.refersTo && valueContext) {
                    const targetVar = valueContext.get(value.refersTo);
                    if (targetVar && targetVar.stringValue !== undefined) {
                        return buildLengthResult(targetVar.stringValue.length);
                    }
                }
            }
            if (((_c = value.type) === null || _c === void 0 ? void 0 : _c.kind) === 'Array') {
                return buildLengthResult(value.type.length);
            }
            return null;
        }
        // Check for struct field access through variable: variableName.fieldName or this.variableName
        const fieldAccessRegex = /^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)$/;
        const fieldAccessMatch = expr.trim().match(fieldAccessRegex);
        if (fieldAccessMatch) {
            const varName = fieldAccessMatch[1];
            const fieldName = fieldAccessMatch[2];
            // Special case: this.this returns the bound outer scope when available
            if (varName === 'this' && fieldName === 'this' && !context.has('this')) {
                const boundThis = context.get('$boundThis');
                if (((_b = boundThis === null || boundThis === void 0 ? void 0 : boundThis.type) === null || _b === void 0 ? void 0 : _b.kind) === 'This') {
                    return snapshotRuntimeValue(boundThis);
                }
                return buildThisValue(context);
            }
            // Special case: this.x refers to variable x in the current scope
            if (varName === 'this' && !context.has('this')) {
                return ensureVariable(fieldName, context);
            }
            const varInfo = ensureVariable(varName, context);
            // Handle special .length property for strings and arrays
            if (fieldName === 'length') {
                const lengthResult = evaluateLengthProperty(varInfo, context);
                if (lengthResult !== null) {
                    return lengthResult;
                }
                throw new Error('cannot access .length on non-string/non-array type');
            }
            if (fieldName === 'this' && ((_c = varInfo.type) === null || _c === void 0 ? void 0 : _c.kind) === 'This') {
                return snapshotRuntimeValue(varInfo);
            }
            const boundFunctionValue = buildBoundThisFunctionValue(snapshotRuntimeValue(varInfo), fieldName, functions, varName);
            if (boundFunctionValue) {
                return boundFunctionValue;
            }
            // Special case: if varInfo is a pointer to This, dereference and access variable
            if (((_d = varInfo.type) === null || _d === void 0 ? void 0 : _d.kind) === 'Ptr' && varInfo.type.pointsTo.kind === 'This') {
                return ensureVariable(fieldName, context);
            }
            if (!varInfo.structFields) {
                throw new Error('variable ' + varName + ' is not a struct');
            }
            const fieldValue = varInfo.structFields.get(fieldName);
            if (!fieldValue) {
                throw new Error('struct ' + (varInfo.structName || 'unknown') + ' has no field: ' + fieldName);
            }
            return fieldValue;
        }
        // Check for :: member access (unbound function pointer extraction): expr::fieldName
        const colonColonMatch = expr.trim().match(/^(.+)::([a-zA-Z_]\w*)$/);
        if (colonColonMatch) {
            const baseExpr = colonColonMatch[1].trim();
            const fieldName = colonColonMatch[2];
            const baseValue = processExprWithContext(baseExpr, context, functions, structs);
            const unboundFnPtr = buildUnboundFunctionPointerValue(baseValue, fieldName, functions);
            if (unboundFnPtr) {
                return unboundFnPtr;
            }
            throw new Error('cannot access ' + fieldName + ' via :: on non-This type');
        }
        // Check for field access on expression results: expr.fieldName
        const exprFieldMatch = expr.trim().match(/^(.+)\s*\.\s*([a-zA-Z_]\w*)$/);
        if (exprFieldMatch) {
            const baseExpr = exprFieldMatch[1].trim();
            const fieldName = exprFieldMatch[2];
            const baseValue = processExprWithContext(baseExpr, context, functions, structs);
            // Handle special .length property for strings and arrays
            if (fieldName === 'length') {
                const lengthResult = evaluateLengthProperty(baseValue, context);
                if (lengthResult !== null) {
                    return lengthResult;
                }
                throw new Error('cannot access .length on non-string/non-array type');
            }
            if (fieldName === 'this' && ((_e = baseValue.type) === null || _e === void 0 ? void 0 : _e.kind) === 'This') {
                return baseValue;
            }
            const boundFunctionValue = buildBoundThisFunctionValue(baseValue, fieldName, functions);
            if (boundFunctionValue) {
                return boundFunctionValue;
            }
            if (((_f = baseValue.type) === null || _f === void 0 ? void 0 : _f.kind) === 'Ptr' && baseValue.type.pointsTo.kind === 'This') {
                return ensureVariable(fieldName, context);
            }
            if (!baseValue.structFields) {
                throw new Error('expression is not a struct');
            }
            const fieldValue = baseValue.structFields.get(fieldName);
            if (!fieldValue) {
                throw new Error('struct ' + (baseValue.structName || 'unknown') + ' has no field: ' + fieldName);
            }
            return fieldValue;
        }
        const trailingCall = parseTrailingCall(expr);
        if (trailingCall) {
            const { calleeExpr, argsStr } = trailingCall;
            if (calleeExpr.includes('.')) {
                // handled by method-style call
            }
            else if (!calleeExpr.match(/^[a-zA-Z_]\w*(?:\s*<\s*[^>]+\s*>)?$/)) {
                const calleeValue = processExprWithContext(calleeExpr, context, functions, structs);
                if (calleeValue.refersToFn) {
                    if (calleeValue.boundThis) {
                        const derivedContext = buildContextFromThisValue(calleeValue.boundThis, context);
                        const result = executeFunctionCall(calleeValue.refersToFn, argsStr, derivedContext, functions, structs);
                        if (calleeValue.boundThisRef && calleeValue.boundThis.structFields) {
                            const fieldKeys = calleeValue.boundThisFieldKeys || Array.from(calleeValue.boundThis.structFields.keys());
                            updateThisFieldsInContext(calleeValue.boundThisRef, fieldKeys, derivedContext, context);
                        }
                        return result;
                    }
                    return executeFunctionCall(calleeValue.refersToFn, argsStr, context, functions, structs);
                }
                throw new Error(buildFunctionNotFoundMessage(calleeExpr, 'call expression ' + calleeExpr));
            }
        }
        // Check for method-style calls: expr.methodName(args...)
        // Support line-broken chaining by collapsing newline + leading dot
        const methodCallExpr = expr.replace(/\s*\n\s*\./g, '.');
        // Need to be careful not to match dots inside bracket expressions
        const methodCallMatch = methodCallExpr.trim().match(/^([\s\S]+)\s*\.\s*([a-zA-Z_]\w*)\s*\(\s*(.*)\s*\)$/);
        if (methodCallMatch) {
            const baseExpr = methodCallMatch[1].trim();
            const fnName = methodCallMatch[2];
            const argsStr = methodCallMatch[3];
            // Check if base expression has balanced brackets
            let bracketDepth = 0;
            let isBalanced = true;
            for (let i = 0; i < baseExpr.length; i++) {
                if (baseExpr[i] === '(' || baseExpr[i] === '[' || baseExpr[i] === '{') {
                    bracketDepth++;
                }
                else if (baseExpr[i] === ')' || baseExpr[i] === ']' || baseExpr[i] === '}') {
                    bracketDepth--;
                    if (bracketDepth < 0) {
                        isBalanced = false;
                        break;
                    }
                }
            }
            if (bracketDepth !== 0) {
                isBalanced = false;
            }
            if (isBalanced && baseExpr !== 'this') {
                const baseValue = processExprWithContext(baseExpr, context, functions, structs);
                if (!functions.has(fnName)) {
                    throw new Error(buildFunctionNotFoundMessage(fnName, 'method call ' + baseExpr + '.' + fnName + '()'));
                }
                const fnDef = functions.get(fnName);
                if (!fnDef) {
                    throw new Error(buildFunctionNotFoundMessage(fnName, 'method call ' + baseExpr + '.' + fnName + '()'));
                }
                const hasThisParam = ((_g = fnDef.params[0]) === null || _g === void 0 ? void 0 : _g.name) === 'this';
                if (!hasThisParam) {
                    if (((_h = baseValue.type) === null || _h === void 0 ? void 0 : _h.kind) === 'This') {
                        const derivedContext = buildContextFromThisValue(baseValue, context);
                        const args = parseCallArguments(argsStr, derivedContext, functions, structs);
                        const result = executeFunctionCallWithArgs(fnName, args, derivedContext, functions, structs);
                        if (baseValue.structFields) {
                            for (const key of baseValue.structFields.keys()) {
                                const updatedValue = derivedContext.get(key);
                                if (updatedValue) {
                                    baseValue.structFields.set(key, snapshotRuntimeValue(updatedValue));
                                }
                            }
                            if (baseExpr.match(/^[a-zA-Z_]\w*$/)) {
                                const targetVar = context.get(baseExpr);
                                if (targetVar) {
                                    context.set(baseExpr, { ...targetVar, structFields: baseValue.structFields });
                                }
                            }
                        }
                        return result;
                    }
                }
                else {
                    let receiverArg = baseValue;
                    if (((_j = fnDef.params[0]) === null || _j === void 0 ? void 0 : _j.type.kind) === 'Ptr') {
                        if (baseExpr.match(/^[a-zA-Z_]\w*$/)) {
                            const receiverVar = ensureVariable(baseExpr, context);
                            if (fnDef.params[0].type.mutable && !receiverVar.mutable) {
                                throw new Error('cannot take mutable reference to immutable variable');
                            }
                            receiverArg = {
                                value: 0,
                                type: {
                                    kind: 'Ptr',
                                    pointsTo: receiverVar.type || { kind: 'I', width: 32 },
                                    mutable: fnDef.params[0].type.mutable,
                                },
                                refersTo: baseExpr,
                            };
                        }
                        else {
                            throw new Error('cannot take reference to non-variable receiver');
                        }
                    }
                    const args = [receiverArg, ...parseCallArguments(argsStr, context, functions, structs)];
                    return executeFunctionCallWithArgs(fnName, args, context, functions, structs);
                }
            }
        }
        // Check for function calls: name() or name(arg1, arg2, ...)
        const functionCallRegex = /^([a-zA-Z_]\w*)\s*(?:<\s*([^>]+)\s*>)?\s*\(\s*(.*)\s*\)$/;
        const callMatch = expr.trim().match(functionCallRegex);
        if (callMatch) {
            const nameOrVar = callMatch[1];
            const explicitTypeArgs = callMatch[2];
            const callArgsStr = callMatch[3];
            const explicitTypes = parseExplicitTypeArgs(explicitTypeArgs);
            let fnName = nameOrVar;
            let boundThis;
            let boundThisInfo;
            // Check if this is a function pointer variable
            if (!functions.has(nameOrVar) && context.has(nameOrVar)) {
                const varInfo = context.get(nameOrVar);
                if (varInfo === null || varInfo === void 0 ? void 0 : varInfo.refersToFn) {
                    fnName = varInfo.refersToFn;
                    boundThis = varInfo.boundThis;
                    boundThisInfo = varInfo;
                }
            }
            if (!functions.has(fnName) && !(currentNativeFunctions === null || currentNativeFunctions === void 0 ? void 0 : currentNativeFunctions.has(fnName))) {
                throw new Error(buildFunctionNotFoundMessage(fnName, 'call expression ' + fnName + '()'));
            }
            if (boundThis) {
                const derivedContext = buildContextFromThisValue(boundThis, context);
                const result = executeFunctionCall(fnName, callArgsStr, derivedContext, functions, structs, explicitTypes);
                if ((boundThisInfo === null || boundThisInfo === void 0 ? void 0 : boundThisInfo.boundThisRef) && boundThis.structFields) {
                    const fieldKeys = boundThisInfo.boundThisFieldKeys || Array.from(boundThis.structFields.keys());
                    updateThisFieldsInContext(boundThisInfo.boundThisRef, fieldKeys, derivedContext, context);
                }
                return result;
            }
            return executeFunctionCall(fnName, callArgsStr, context, functions, structs, explicitTypes);
        }
        // Check for function calls through this notation: this.functionName()
        const thisFunctionCallRegex = /^this\s*\.\s*([a-zA-Z_]\w*)\s*\(\s*(.*)\s*\)$/;
        const thisCallMatch = expr.trim().match(thisFunctionCallRegex);
        if (thisCallMatch) {
            if (!functions.has(thisCallMatch[1])) {
                throw new Error(buildFunctionNotFoundMessage(thisCallMatch[1], 'method call this.' + thisCallMatch[1] + '()'));
            }
            return executeFunctionCall(thisCallMatch[1], thisCallMatch[2], context, functions, structs);
        }
        let e = expr;
        let sawBlockReplacement = false;
        // Handle parentheses and braces recursively
        while (e.includes('(') || e.includes('{')) {
            // Find the first opening bracket and its matching closing bracket
            let openPos = -1;
            let openChar = '';
            let closeChar = '';
            for (let i = 0; i < e.length; i++) {
                if (e[i] === '(' || e[i] === '{') {
                    openPos = i;
                    openChar = e[i];
                    closeChar = e[i] === '(' ? ')' : '}';
                    break;
                }
            }
            if (openPos === -1)
                break;
            // Find matching closing bracket
            let depth = 1;
            let closePos = -1;
            for (let i = openPos + 1; i < e.length; i++) {
                if (e[i] === openChar) {
                    depth++;
                }
                else if (e[i] === closeChar) {
                    depth--;
                    if (depth === 0) {
                        closePos = i;
                        break;
                    }
                }
            }
            if (closePos === -1) {
                const start = Math.max(0, openPos - 20);
                const end = Math.min(e.length, openPos + 30);
                const context = e.substring(start, end);
                const pointerPos = openPos - start;
                throw new Error('mismatched ' +
                    openChar +
                    (openChar === '(' ? ')' : '}') +
                    ': unmatched ' +
                    openChar +
                    ' at position ' +
                    openPos +
                    '\n  ' +
                    context +
                    '\n  ' +
                    ' '.repeat(pointerPos) +
                    '^');
            }
            const content = e.substring(openPos + 1, closePos);
            let res;
            // Check if this is a block with expressions or assignments
            if (openChar === '{') {
                const blockResult = processBlock(content, context, functions, structs);
                res = blockResult.result;
                sawBlockReplacement = true;
                // Update parent context with changes from block
                mergeBlockContext(blockResult, context);
            }
            else {
                // Regular parenthesization - just evaluate the contents
                res = processExprWithContext(content, context, functions, structs);
            }
            let replacement = res.value.toString();
            if (res.type) {
                if (res.type.kind === 'Bool') {
                    replacement = res.value === 1 ? 'true' : 'false';
                }
                else if (res.type.kind === 'Ptr') {
                    // For pointers, we store the reference variable name, don't change the representation
                    // The value is already the variable index or reference
                    replacement = res.value.toString();
                }
                else if ('width' in res.type) {
                    replacement += res.type.kind + res.type.width;
                }
            }
            e = e.substring(0, openPos) + replacement + e.substring(closePos + 1);
        }
        try {
            return evaluateExpression(e, context, functions, structs);
        }
        catch (err) {
            if (sawBlockReplacement && err instanceof Error && err.message === 'invalid expression') {
                const trimmed = e.trim();
                const match = trimmed.match(/^(true|false|[+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)\s+(.+)$/);
                if (match) {
                    return evaluateExpression(match[2], context, functions, structs);
                }
            }
            throw err;
        }
    }
    // Helper to process a code block and return the final expression result along with updated context
    function processBlock(blockContent, parentContext, functions, structs) {
        var _a, _b, _c, _d, _e, _f, _g;
        const context = new Map(parentContext);
        const declaredInThisBlock = new Set();
        // Split by ';' but respect bracket boundaries
        const statements = [];
        let currentStmt = '';
        let bracketDepth = 0;
        const isIdentChar = (ch) => !!ch && /[A-Za-z0-9_]/.test(ch);
        for (let i = 0; i < blockContent.length; i++) {
            const ch = blockContent[i];
            if (bracketDepth === 0 && blockContent.startsWith('fn ', i)) {
                const prev = i > 0 ? blockContent[i - 1] : undefined;
                if (!isIdentChar(prev) && currentStmt.trim()) {
                    statements.push(currentStmt.trim());
                    currentStmt = '';
                }
            }
            if (ch === '(' || ch === '{' || ch === '[') {
                bracketDepth++;
                currentStmt += ch;
            }
            else if (ch === ')' || ch === '}' || ch === ']') {
                bracketDepth--;
                currentStmt += ch;
            }
            else if (ch === ';' && bracketDepth === 0) {
                if (currentStmt.trim()) {
                    statements.push(currentStmt.trim());
                }
                currentStmt = '';
            }
            else if (ch === '\n' && bracketDepth === 0) {
                const trimmed = currentStmt.trim();
                if (trimmed.startsWith('fn ') && trimmed.includes('=>')) {
                    statements.push(trimmed);
                    currentStmt = '';
                }
                else {
                    currentStmt += ch;
                }
            }
            else {
                currentStmt += ch;
            }
        }
        let hasTrailingExpression = !!currentStmt.trim();
        if (hasTrailingExpression) {
            statements.push(currentStmt.trim());
        }
        const structNames = new Set();
        let finalExpr = '';
        let lastProcessedValue;
        for (let stmtIndex = 0; stmtIndex < statements.length; stmtIndex++) {
            const stmt = statements[stmtIndex];
            if (stmt.startsWith('type ')) {
                const typeMatch = stmt.match(/^type\s+([a-zA-Z_]\w*)(?:\s*<[^>]+>)?\s*=\s*(.+?)(?:\s+then\s+([a-zA-Z_]\w*))?$/);
                if (!typeMatch)
                    throw new Error('invalid type alias');
                const aliasName = typeMatch[1];
                if (typeAliases.has(aliasName)) {
                    throw new Error('type alias already defined: ' + aliasName);
                }
                const aliasTypeStr = typeMatch[2].trim();
                const dropFnName = typeMatch[3];
                const aliasSuffix = parseStructFieldType(aliasTypeStr);
                if (!aliasSuffix)
                    throw new Error('invalid type alias');
                typeAliases.set(aliasName, { type: aliasSuffix, dropFn: dropFnName });
                continue;
            }
            if (stmt.startsWith('fn ')) {
                const fnMatch = parseFunctionDefinition(stmt);
                const fnName = fnMatch.name;
                const genericsRaw = fnMatch.genericsRaw;
                const paramsStr = fnMatch.paramsStr;
                const returnTypeRaw = fnMatch.returnTypeRaw;
                let fnBody = fnMatch.body;
                let remainder = '';
                if (fnBody.startsWith('{')) {
                    let depth = 0;
                    let closePos = -1;
                    for (let i = 0; i < fnBody.length; i++) {
                        if (fnBody[i] === '{') {
                            depth++;
                        }
                        else if (fnBody[i] === '}') {
                            depth--;
                            if (depth === 0) {
                                closePos = i;
                                break;
                            }
                        }
                    }
                    if (closePos !== -1 && closePos < fnBody.length - 1) {
                        remainder = fnBody.substring(closePos + 1).trim();
                        fnBody = fnBody.substring(0, closePos + 1).trim();
                    }
                }
                const generics = genericsRaw
                    ? genericsRaw
                        .split(',')
                        .map((name) => name.trim())
                        .filter(Boolean)
                    : [];
                if (new Set(generics).size !== generics.length) {
                    throw new Error('duplicate generic parameter');
                }
                if (functions.has(fnName)) {
                    throw new Error('function already defined: ' + fnName);
                }
                const returnTypeStr = returnTypeRaw ? returnTypeRaw.trim() : undefined;
                const params = [];
                const paramNames = new Set();
                if (paramsStr.trim()) {
                    const paramParts = paramsStr.split(',').map((p) => p.trim());
                    for (const paramPart of paramParts) {
                        const paramMatch = paramPart.match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
                        if (!paramMatch)
                            throw new Error('invalid parameter');
                        const paramName = paramMatch[1];
                        if (paramNames.has(paramName)) {
                            throw new Error('duplicate parameter name: ' + paramName);
                        }
                        const paramType = paramMatch[2].trim();
                        let paramSuffix;
                        if (paramType.startsWith('*mut ')) {
                            paramSuffix = parsePointerSuffix(paramType.substring(5).trim(), true);
                        }
                        else if (paramType.startsWith('*')) {
                            paramSuffix = parsePointerSuffix(paramType.substring(1).trim(), false);
                        }
                        else {
                            paramSuffix = tryParseSuffix(paramType);
                        }
                        if (!paramSuffix && generics.includes(paramType)) {
                            paramSuffix = { kind: 'Generic', name: paramType };
                        }
                        if (!paramSuffix)
                            throw new Error('invalid parameter type: ' + paramType);
                        paramNames.add(paramName);
                        params.push({ name: paramName, type: paramSuffix });
                    }
                }
                let returnSuffix;
                if (returnTypeStr) {
                    if (returnTypeStr.startsWith('*mut ')) {
                        returnSuffix = parsePointerSuffix(returnTypeStr.substring(5).trim(), true);
                    }
                    else if (returnTypeStr.startsWith('*')) {
                        returnSuffix = parsePointerSuffix(returnTypeStr.substring(1).trim(), false);
                    }
                    else {
                        returnSuffix = tryParseSuffix(returnTypeStr);
                    }
                    if (!returnSuffix && generics.includes(returnTypeStr)) {
                        returnSuffix = { kind: 'Generic', name: returnTypeStr };
                    }
                    if (!returnSuffix)
                        throw new Error('invalid return type: ' + returnTypeStr);
                }
                functions.set(fnName, {
                    params,
                    returnType: returnSuffix,
                    generics,
                    body: fnBody,
                });
                if (remainder) {
                    statements.splice(stmtIndex + 1, 0, remainder);
                }
            }
            else if (stmt.startsWith('struct ')) {
                let remainder = stmt;
                while (remainder.startsWith('struct ')) {
                    const structMatch = remainder.match(/^struct\s+([a-zA-Z_]\w*)(?:\s*<\s*([^>]+)\s*>)?\s*\{\s*([\s\S]*?)\s*\}\s*(?:;\s*)?/);
                    if (!structMatch)
                        throw new Error('invalid struct declaration');
                    const structName = structMatch[1];
                    const typeParamsStr = structMatch[2];
                    const typeParams = typeParamsStr ? typeParamsStr.split(',').map((p) => p.trim()) : undefined;
                    if (structs.has(structName) || structNames.has(structName)) {
                        throw new Error('struct already defined: ' + structName);
                    }
                    structNames.add(structName);
                    const fieldNames = new Set();
                    const fieldDefs = [];
                    const fields = structMatch[3].split(';');
                    for (const field of fields) {
                        const fieldTrimmed = field.trim();
                        if (!fieldTrimmed)
                            continue;
                        const fieldMatch = fieldTrimmed.match(/^([a-zA-Z_]\w*)\s*:\s*([\s\S]+)$/);
                        if (!fieldMatch)
                            throw new Error('invalid struct field: ' + fieldTrimmed);
                        const fieldName = fieldMatch[1];
                        if (fieldNames.has(fieldName)) {
                            throw new Error('duplicate struct field: ' + fieldName);
                        }
                        const fieldType = parseStructFieldType(fieldMatch[2]);
                        if (!fieldType) {
                            throw new Error('invalid struct field type: ' + fieldMatch[2].trim());
                        }
                        fieldNames.add(fieldName);
                        fieldDefs.push({ name: fieldName, type: fieldType });
                    }
                    structs.set(structName, { fields: fieldDefs, typeParams });
                    remainder = remainder.substring(structMatch[0].length).trim();
                }
                if (remainder) {
                    statements.splice(stmtIndex + 1, 0, remainder);
                }
                continue;
            }
            else if (stmt.startsWith('object ')) {
                const nameMatch = stmt.match(/^object\s+([a-zA-Z_]\w*)\s*/);
                if (!nameMatch) {
                    throw new Error('invalid object declaration');
                }
                const objectName = nameMatch[1];
                if (declaredInThisBlock.has(objectName)) {
                    throw new Error('variable already declared: ' + objectName);
                }
                const braceStart = stmt.indexOf('{');
                const braceEnd = stmt.lastIndexOf('}');
                if (braceStart === -1 || braceEnd === -1 || braceEnd < braceStart) {
                    throw new Error('invalid object declaration');
                }
                const body = stmt.substring(braceStart + 1, braceEnd);
                let remainder = stmt.substring(braceEnd + 1).trim();
                if (remainder.startsWith(';')) {
                    remainder = remainder.substring(1).trim();
                }
                const objectContext = new Map();
                const objectResult = processBlock(body, objectContext, functions, structs);
                const fields = new Map();
                for (const [key, value] of objectResult.context) {
                    if (!value.initialized) {
                        continue;
                    }
                    fields.set(key, snapshotRuntimeValue(value));
                }
                context.set(objectName, {
                    value: 0,
                    type: { kind: 'This' },
                    mutable: false,
                    initialized: true,
                    structName: objectName,
                    structFields: fields,
                });
                declaredInThisBlock.add(objectName);
                if (remainder) {
                    statements.splice(stmtIndex + 1, 0, remainder);
                }
                finalExpr = '';
                lastProcessedValue = undefined;
            }
            else if (stmt.startsWith('let ')) {
                // parse: let [mut] x [: Type] [= expr]
                // Type can be: U8, I32, Bool, *I32, *U16, etc.
                const parsedLet = parseLetStatement(stmt);
                const isMutable = parsedLet.isMutable;
                const varName = parsedLet.varName;
                if (declaredInThisBlock.has(varName)) {
                    throw new Error('variable already declared: ' + varName);
                }
                const varType = parsedLet.varType; // undefined if no type specified
                const varExprStr = parsedLet.varExprStr;
                // evaluate the initialization expression if present
                let varValue = 0;
                let valSuffix;
                let initialized = false;
                let refersTo;
                let structName;
                let structFields;
                let arrayElements;
                let arrayInitializedCount;
                let tupleElements;
                let refersToFn;
                let boundThis;
                let stringValue;
                // First, try to parse the declared type
                let declaredSuffix;
                let maxValue;
                let normalizedVarType = varType;
                if (varType) {
                    const constraintMatch = varType.match(/^(.+?)\s*<\s*([+-]?\d+)\s*$/);
                    if (constraintMatch) {
                        normalizedVarType = constraintMatch[1].trim();
                        maxValue = Number(constraintMatch[2]);
                        if (!Number.isInteger(maxValue)) {
                            throw new Error('invalid type constraint');
                        }
                    }
                }
                if (normalizedVarType) {
                    if (normalizedVarType === 'Bool') {
                        declaredSuffix = { kind: 'Bool', width: 1 };
                    }
                    else if (normalizedVarType.startsWith('*mut ')) {
                        declaredSuffix = parsePointerSuffix(normalizedVarType.substring(5).trim(), true);
                    }
                    else if (normalizedVarType.startsWith('[')) {
                        declaredSuffix = tryParseSuffix(normalizedVarType);
                    }
                    else {
                        // Try parsing as function pointer type or other general types first
                        declaredSuffix = tryParseSuffix(normalizedVarType);
                        if (!declaredSuffix) {
                            // If that failed and it starts with *, try as pointer type
                            if (normalizedVarType.startsWith('*')) {
                                declaredSuffix = parsePointerSuffix(normalizedVarType.substring(1).trim(), false);
                            }
                            else {
                                const typeMatch = normalizedVarType.match(/^([UI])(\d+)$/);
                                if (typeMatch) {
                                    const kind = typeMatch[1];
                                    const width = Number(typeMatch[2]);
                                    declaredSuffix = { kind, width };
                                }
                            }
                        }
                    }
                }
                // Handle function pointer assignment specially
                if ((declaredSuffix === null || declaredSuffix === void 0 ? void 0 : declaredSuffix.kind) === 'FnPtr' && varExprStr !== undefined) {
                    const exprTrimmed = varExprStr.trim();
                    // Check if varExprStr is just a function name (no parentheses)
                    const fnNameMatch = exprTrimmed.match(/^([a-zA-Z_]\w*)$/);
                    if (fnNameMatch) {
                        const fnName = fnNameMatch[1];
                        if (functions.has(fnName)) {
                            // This is a function pointer assignment
                            varValue = 0; // Function pointers have value 0
                            valSuffix = declaredSuffix;
                            refersToFn = fnName;
                            initialized = true;
                        }
                        else {
                            // Not a known function, try normal evaluation
                            const varValueObj = evaluateNonVoidExpression(varExprStr, context, functions, structs);
                            varValue = varValueObj.value;
                            valSuffix = varValueObj.type;
                            refersTo = varValueObj.refersTo;
                            refersToFn = varValueObj.refersToFn;
                            boundThis = varValueObj.boundThis;
                            stringValue = varValueObj.stringValue;
                            initialized = true;
                        }
                    }
                    else {
                        // Not a simple function name, try normal evaluation
                        const varValueObj = evaluateNonVoidExpression(varExprStr, context, functions, structs);
                        varValue = varValueObj.value;
                        valSuffix = varValueObj.type;
                        refersTo = varValueObj.refersTo;
                        refersToFn = varValueObj.refersToFn;
                        boundThis = varValueObj.boundThis;
                        stringValue = varValueObj.stringValue;
                        initialized = true;
                    }
                }
                else if (varExprStr !== undefined) {
                    const varValueObj = evaluateNonVoidExpression(varExprStr, context, functions, structs);
                    const isArrayLiteral = varExprStr.trim().startsWith('[');
                    if (((_a = varValueObj.type) === null || _a === void 0 ? void 0 : _a.kind) === 'Array' && !isArrayLiteral) {
                        throw new Error('cannot copy arrays');
                    }
                    varValue = varValueObj.value;
                    valSuffix = varValueObj.type;
                    refersTo = varValueObj.refersTo;
                    refersToFn = varValueObj.refersToFn;
                    structName = varValueObj.structName;
                    structFields = varValueObj.structFields;
                    arrayElements = varValueObj.arrayElements;
                    arrayInitializedCount = varValueObj.arrayInitializedCount;
                    tupleElements = varValueObj.tupleElements;
                    boundThis = varValueObj.boundThis;
                    stringValue = varValueObj.stringValue;
                    initialized = true;
                }
                // validate against the type only if specified
                if (declaredSuffix && initialized) {
                    if (declaredSuffix.kind !== 'FnPtr') {
                        validateNarrowing(valSuffix, declaredSuffix);
                        if (declaredSuffix.kind !== 'Ptr' && declaredSuffix.kind !== 'Array' && 'width' in declaredSuffix) {
                            validateValueAgainstSuffix(varValue, declaredSuffix.kind, declaredSuffix.width);
                        }
                        if (maxValue !== undefined) {
                            if (declaredSuffix.kind !== 'U' && declaredSuffix.kind !== 'I') {
                                throw new Error('invalid type constraint');
                            }
                            if (varValue >= maxValue) {
                                throw new Error('value exceeds type constraint');
                            }
                        }
                        if (declaredSuffix.kind === 'Array' && arrayElements) {
                            if (arrayElements.length !== declaredSuffix.length) {
                                throw new Error('array length mismatch');
                            }
                            if (arrayElements.length !== declaredSuffix.initializedCount) {
                                throw new Error('array initialized count mismatch');
                            }
                            for (const element of arrayElements) {
                                if (!element) {
                                    throw new Error('array element not initialized');
                                }
                                const elementSuffix = element.type || { kind: 'I', width: 32 };
                                validateNarrowing(elementSuffix, declaredSuffix.elementType);
                                if (declaredSuffix.elementType.kind !== 'Ptr' && declaredSuffix.elementType.kind !== 'Array' && 'width' in declaredSuffix.elementType) {
                                    validateValueAgainstSuffix(element.value, declaredSuffix.elementType.kind, declaredSuffix.elementType.width);
                                }
                            }
                        }
                    }
                }
                if (!initialized && (declaredSuffix === null || declaredSuffix === void 0 ? void 0 : declaredSuffix.kind) === 'Array') {
                    if (declaredSuffix.initializedCount > 0) {
                        throw new Error('array requires initializer');
                    }
                    arrayElements = new Array(declaredSuffix.length).fill(undefined);
                    arrayInitializedCount = 0;
                }
                if (initialized && (declaredSuffix === null || declaredSuffix === void 0 ? void 0 : declaredSuffix.kind) === 'Array' && arrayElements && arrayInitializedCount === undefined) {
                    arrayInitializedCount = arrayElements.length;
                }
                const varInfo = {
                    value: varValue,
                    type: declaredSuffix || valSuffix || { kind: 'I', width: 32 },
                    mutable: isMutable,
                    initialized: initialized,
                    refersTo: refersTo,
                    refersToFn: refersToFn,
                    boundThis: boundThis,
                    structName: structName,
                    structFields: structFields,
                    arrayElements: arrayElements,
                    arrayInitializedCount: arrayInitializedCount,
                    tupleElements: tupleElements,
                    stringValue: stringValue,
                    maxValue: maxValue,
                    dropFn: normalizedVarType ? getAliasDropFn(normalizedVarType) : undefined,
                };
                context.set(varName, varInfo);
                declaredInThisBlock.add(varName);
                finalExpr = '';
                lastProcessedValue = undefined;
            }
            else if (stmt.startsWith('while ')) {
                // while loop: while (condition) body
                const m = stmt.match(/^while\s*\(\s*(.+?)\s*\)\s*(.+)$/);
                if (!m) {
                    finalExpr = stmt;
                    lastProcessedValue = undefined;
                    continue;
                }
                const conditionExpr = m[1];
                let bodyExpr = m[2].trim();
                // If body starts with {, extract just the bracketed part
                if (bodyExpr.startsWith('{')) {
                    let depth = 0;
                    let endPos = -1;
                    for (let i = 0; i < bodyExpr.length; i++) {
                        if (bodyExpr[i] === '{')
                            depth++;
                        else if (bodyExpr[i] === '}')
                            depth--;
                        if (depth === 0) {
                            endPos = i;
                            break;
                        }
                    }
                    if (endPos !== -1) {
                        bodyExpr = bodyExpr.substring(0, endPos + 1);
                    }
                }
                // Execute while loop
                while (true) {
                    const condObj = processExprWithContext(conditionExpr, context, functions, structs);
                    if (((_b = condObj.type) === null || _b === void 0 ? void 0 : _b.kind) !== 'Bool') {
                        throw new Error('while condition must be boolean');
                    }
                    if (!condObj.value)
                        break; // condition is false
                    // Execute body as a block statement to update context
                    const bodyBlockResult = processBlock(bodyExpr, context, functions, structs);
                    // Merge changes from body back into current context
                    for (const [key, value] of bodyBlockResult.context) {
                        if (context.has(key)) {
                            context.set(key, value);
                        }
                    }
                }
                // Check if there's trailing content after the while body (for the final expression)
                const bodyEndInStmt = stmt.indexOf(bodyExpr) + bodyExpr.length;
                const trailing = stmt.substring(bodyEndInStmt).trim();
                finalExpr = trailing || stmt;
                lastProcessedValue = undefined;
            }
            else if (stmt.includes('=') && !stmt.startsWith('let ')) {
                // assignment: x = 100 or compound: x += 1, x -= 2, x *= 3, x /= 4 or *y = 100
                const updateBoundThisField = (varName, updatedVarInfo, markDirty) => {
                    var _a;
                    const boundThis = context.get('$boundThis');
                    if (((_a = boundThis === null || boundThis === void 0 ? void 0 : boundThis.type) === null || _a === void 0 ? void 0 : _a.kind) === 'This' && boundThis.structFields) {
                        boundThis.structFields.set(varName, snapshotRuntimeValue(updatedVarInfo));
                        context.set('$boundThis', boundThis);
                        if (markDirty) {
                            context.set('$boundThisDirty', {
                                value: 1,
                                type: { kind: 'Bool', width: 1 },
                                mutable: false,
                                initialized: true,
                            });
                        }
                    }
                };
                const recordAssignment = (varName, updatedVarInfo) => {
                    context.set(varName, updatedVarInfo);
                    if (!declaredInThisBlock.has(varName) && parentContext.has(varName)) {
                        parentContext.set(varName, updatedVarInfo);
                    }
                    updateBoundThisField(varName, updatedVarInfo, false);
                    finalExpr = stmt;
                    lastProcessedValue = updatedVarInfo;
                };
                const ensureMutableVar = (varName) => {
                    const varInfo = ensureVariable(varName, context);
                    if (!varInfo.mutable && varInfo.initialized) {
                        throw new Error('cannot assign to immutable variable: ' + varName);
                    }
                    return varInfo;
                };
                // First check if it's a dereferenced pointer assignment (*y = ...)
                const derefMatch = stmt.match(/^\*([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
                if (derefMatch) {
                    const ptrName = derefMatch[1];
                    const op = derefMatch[2];
                    const varExprStr = derefMatch[3].trim();
                    const ptrInfo = ensurePointer(ptrName, context);
                    if (!ptrInfo.type.mutable) {
                        throw new Error('cannot assign through immutable pointer');
                    }
                    const targetVarName = ptrInfo.refersTo;
                    const targetVarInfo = ensureVariable(targetVarName, context);
                    if (!targetVarInfo.mutable) {
                        throw new Error('cannot assign to immutable variable through pointer');
                    }
                    const newValueObj = evaluateAssignmentValue(targetVarInfo.value, op, varExprStr, context, functions, structs);
                    const newValue = newValueObj.value;
                    const newValSuffix = newValueObj.type;
                    // validate against pointee type
                    const ptrType = ptrInfo.type;
                    const pointeeType = ptrType.pointsTo;
                    if (pointeeType) {
                        validateNarrowing(newValSuffix, pointeeType);
                        if (pointeeType.kind !== 'Ptr' && 'width' in pointeeType) {
                            validateValueAgainstSuffix(newValue, pointeeType.kind, pointeeType.width);
                        }
                    }
                    const updatedTargetInfo = { ...targetVarInfo, value: newValue, initialized: true };
                    recordAssignment(targetVarName, updatedTargetInfo);
                }
                else {
                    // Array element assignment: array[index] = value or array[index] += value
                    const arrayAssignMatch = stmt.match(/^([a-zA-Z_]\w*)\s*\[\s*(.+?)\s*\]\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
                    if (arrayAssignMatch) {
                        const varName = arrayAssignMatch[1];
                        const indexExpr = arrayAssignMatch[2].trim();
                        const op = arrayAssignMatch[3];
                        const varExprStr = arrayAssignMatch[4].trim();
                        const indexValueObj = processExprWithContext(indexExpr, context, functions, structs);
                        const index = Number(indexValueObj.value);
                        if (!Number.isInteger(index)) {
                            throw new Error('array index must be an integer');
                        }
                        let varInfo = ensureVariable(varName, context);
                        let targetArrayVarName = varName;
                        // Check if this is a pointer to a mutable array
                        if (((_c = varInfo.type) === null || _c === void 0 ? void 0 : _c.kind) === 'Ptr' && varInfo.type.pointsTo.kind === 'Array' && varInfo.type.mutable) {
                            // Resolve the actual array from the pointer
                            if (varInfo.refersTo) {
                                const targetVar = context.get(varInfo.refersTo);
                                if (targetVar) {
                                    targetArrayVarName = varInfo.refersTo;
                                    varInfo = targetVar;
                                }
                            }
                        }
                        else if (!varInfo.mutable && varInfo.initialized) {
                            // Not a mutable pointer to array, so the variable itself must be mutable
                            throw new Error('cannot assign to immutable variable: ' + varName);
                        }
                        if (((_d = varInfo.type) === null || _d === void 0 ? void 0 : _d.kind) !== 'Array') {
                            throw new Error('variable ' + varName + ' is not an array');
                        }
                        const arrayLength = varInfo.type.length;
                        const elements = varInfo.arrayElements || new Array(arrayLength).fill(undefined);
                        if (index < 0 || index >= elements.length) {
                            throw new Error('array index out of bounds');
                        }
                        const currentInitializedCount = (_e = varInfo.arrayInitializedCount) !== null && _e !== void 0 ? _e : elements.filter((e) => e !== undefined).length;
                        if (!elements[index] && index !== currentInitializedCount) {
                            throw new Error('array elements must be initialized in order');
                        }
                        const currentElement = elements[index];
                        if (op !== '=' && !currentElement) {
                            throw new Error('array element not initialized');
                        }
                        const currentValue = currentElement ? currentElement.value : 0;
                        const newValueObj = evaluateAssignmentValue(currentValue, op, varExprStr, context, functions, structs);
                        const newValue = newValueObj.value;
                        const newValSuffix = newValueObj.type || { kind: 'I', width: 32 };
                        const elementType = varInfo.type.elementType;
                        validateNarrowing(newValSuffix, elementType);
                        if (elementType.kind !== 'Ptr' && elementType.kind !== 'Array' && 'width' in elementType) {
                            validateValueAgainstSuffix(newValue, elementType.kind, elementType.width);
                        }
                        elements[index] = { value: newValue, suffix: newValSuffix };
                        const newInitCount = currentElement ? currentInitializedCount : currentInitializedCount + 1;
                        const updatedSuffix = {
                            ...varInfo.type,
                            initializedCount: newInitCount,
                        };
                        const updatedVarInfo = {
                            ...varInfo,
                            type: updatedSuffix,
                            arrayElements: elements,
                            arrayInitializedCount: newInitCount,
                            initialized: true,
                        };
                        recordAssignment(targetArrayVarName, updatedVarInfo);
                        continue;
                    }
                    // Regular variable assignment or this.x assignment or pointerToThis.x assignment
                    let m = stmt.match(/^([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
                    let varName;
                    let op;
                    let varExprStr;
                    let shouldUpdateBoundThis = false;
                    if (!m) {
                        // Check for this.x assignment or pointerVar.x assignment
                        const dotAssignMatch = stmt.match(/^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
                        if (!dotAssignMatch) {
                            finalExpr = stmt;
                            lastProcessedValue = undefined;
                            continue;
                        }
                        const assignTarget = dotAssignMatch[1];
                        const fieldName = dotAssignMatch[2];
                        op = dotAssignMatch[3];
                        varExprStr = dotAssignMatch[4].trim();
                        if (assignTarget === 'this') {
                            varName = fieldName;
                            shouldUpdateBoundThis = true;
                        }
                        else {
                            // Check if this is a pointer to This
                            const ptrVarInfo = ensureVariable(assignTarget, context);
                            if (((_f = ptrVarInfo.type) === null || _f === void 0 ? void 0 : _f.kind) === 'Ptr' && ptrVarInfo.type.pointsTo.kind === 'This' && ptrVarInfo.type.mutable) {
                                varName = fieldName;
                                shouldUpdateBoundThis = true;
                            }
                            else {
                                // Regular field assignment on a struct through a variable
                                throw new Error('assignments to struct fields not yet supported');
                            }
                        }
                    }
                    else {
                        varName = m[1];
                        op = m[2];
                        varExprStr = m[3].trim();
                    }
                    const varInfo = ensureMutableVar(varName);
                    if (op !== '=' && ((_g = varInfo.type) === null || _g === void 0 ? void 0 : _g.kind) === 'Bool') {
                        throw new Error('cannot perform arithmetic on booleans');
                    }
                    const newValueObj = evaluateAssignmentValue(varInfo.value, op, varExprStr, context, functions, structs);
                    const newValue = newValueObj.value;
                    const newValSuffix = newValueObj.type;
                    const isArrayLiteral = varExprStr.trim().startsWith('[');
                    if ((newValSuffix === null || newValSuffix === void 0 ? void 0 : newValSuffix.kind) === 'Array' && !isArrayLiteral) {
                        throw new Error('cannot copy arrays');
                    }
                    if (varInfo.maxValue !== undefined && newValue >= varInfo.maxValue) {
                        throw new Error('value exceeds type constraint');
                    }
                    // validate against original type
                    if (varInfo.type) {
                        validateNarrowing(newValSuffix, varInfo.type);
                        if (varInfo.type.kind !== 'Ptr' && 'width' in varInfo.type) {
                            validateValueAgainstSuffix(newValue, varInfo.type.kind, varInfo.type.width);
                        }
                    }
                    const updatedVarInfo = { ...varInfo, value: newValue, initialized: true };
                    recordAssignment(varName, updatedVarInfo);
                    if (shouldUpdateBoundThis) {
                        updateBoundThisField(varName, updatedVarInfo, true);
                    }
                }
            }
            else {
                // Execute statement for side effects, or treat as final expression
                if (stmtIndex < statements.length - 1 || !hasTrailingExpression) {
                    // Execute for side effects
                    processExprWithContext(stmt, context, functions, structs);
                    lastProcessedValue = undefined;
                }
                else {
                    // Last statement - treat as final expression
                    finalExpr = stmt;
                    lastProcessedValue = undefined;
                }
            }
        }
        // Helper to call drop functions for variables going out of scope
        const callDropFunctions = () => {
            for (const varName of declaredInThisBlock) {
                const varInfo = context.get(varName);
                if ((varInfo === null || varInfo === void 0 ? void 0 : varInfo.dropFn) && varInfo.initialized) {
                    const dropFn = functions.get(varInfo.dropFn);
                    if (dropFn) {
                        // Call drop function with variable value
                        const fnContext = new Map(context);
                        if (dropFn.params.length === 1) {
                            const param = dropFn.params[0];
                            fnContext.set(param.name, {
                                value: varInfo.value,
                                type: varInfo.type,
                                mutable: false,
                                initialized: true,
                                refersTo: varInfo.refersTo,
                                structName: varInfo.structName,
                                structFields: varInfo.structFields,
                                arrayElements: varInfo.arrayElements,
                                arrayInitializedCount: varInfo.arrayInitializedCount,
                                tupleElements: varInfo.tupleElements,
                            });
                            const bodyResult = processBlock(dropFn.body, fnContext, functions, structs);
                            // Merge changes back to context (for closure updates)
                            mergeBlockContext(bodyResult, context);
                        }
                    }
                }
            }
        };
        if (hasTrailingExpression && !finalExpr.trim() && !lastProcessedValue) {
            hasTrailingExpression = false;
        }
        if (!hasTrailingExpression || !finalExpr.trim()) {
            callDropFunctions();
            return { result: { value: 0 }, context, declaredInThisBlock, hasTrailingExpression };
        }
        if (lastProcessedValue) {
            callDropFunctions();
            return { result: lastProcessedValue, context, declaredInThisBlock, hasTrailingExpression };
        }
        callDropFunctions();
        return {
            result: processExprWithContext(finalExpr, context, functions, structs),
            context,
            declaredInThisBlock,
            hasTrailingExpression,
        };
    }
    // Check for top-level code (which can be a single expression or multiple statements)
    try {
        const functions = new Map();
        const structs = new Map();
        return processBlock(s, new Map(), functions, structs).result.value;
    }
    catch (e) {
        if (e instanceof Error && (e.message === 'invalid literal' || e.message === 'invalid expression')) {
            return 0;
        }
        throw e;
    }
}
// Main bundler entry point
if (require.main === module) {
    try {
        const fs = require('fs');
        const path = require('path');
        const replInputs = buildReplInputs(process.cwd());
        const bundled = compileAll(replInputs.inputs, replInputs.config, replInputs.nativeConfig);
        const distDir = path.join(process.cwd(), 'generated');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }
        const wrapped = ['process.exit((function() {', bundled, '})());'].join('\n');
        const bundlePath = path.join(distDir, 'bundle.js');
        fs.writeFileSync(bundlePath, wrapped, 'utf-8');
        console.log('Successfully bundled to ' + bundlePath);
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
            process.exit(1);
        }
        throw error;
    }
}

return module.exports;
})();
const __tuff_extern_alloc = __tuff_native_module_lib.alloc;
const __tuff_extern_free = __tuff_native_module_lib.free;
const __tuff_extern_checkMemoryOrPanic = __tuff_native_module_lib.checkMemoryOrPanic;
const __tuff_extern_interpret = __tuff_native_module_index.interpret;
const __tuff_extern_readContent = __tuff_native_module_lib.readContent;
const __tuff_extern_println = __tuff_native_module_lib.println;
function alloc(length) { return __tuff_extern_alloc(length); } function free(_this) { return (() => { return __tuff_extern_free(_this);; })(); } function checkMemoryOrPanic() { return (() => { return __tuff_extern_checkMemoryOrPanic();; })(); } function readContent() { return __tuff_extern_readContent(); } function println(content) { return (() => { return __tuff_extern_println(content);; })(); } println("100"); checkMemoryOrPanic(); return +(0);
})());