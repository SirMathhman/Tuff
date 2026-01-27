interface TypeConstraint {
    minValue: number;
    maxValue: number;
    typeStr: string;
    bitWidth?: number;
}

function getTypeConstraint(source: string): TypeConstraint | null {
    if (source.startsWith('*')) {
        let isMutablePointer = false;
        let innerType = source.substring(1).trim();
        if (innerType.startsWith('mut ')) {
            isMutablePointer = true;
            innerType = innerType.substring(4).trim();
        }
        const innerConstraint = getTypeConstraint(innerType);
        if (innerConstraint) {
            return {
                minValue: 0,
                maxValue: Number.MAX_SAFE_INTEGER,
                typeStr: '*' + (isMutablePointer ? 'mut ' : '') + innerConstraint.typeStr,
                bitWidth: innerConstraint.bitWidth
            };
        }
        return null; // Ensure we return null if inner type is invalid
    }
    if (source.endsWith('Bool')) {
        return { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
    }
    const typeMatch = source.match(/([UIF])(\d+)$/);
    if (!typeMatch || !typeMatch[1] || !typeMatch[2]) {
        return null;
    }
    
    const typePrefix = typeMatch[1];
    const bitWidth = parseInt(typeMatch[2], 10);
    
    let minValue: number, maxValue: number;
    
    if (typePrefix === 'U') {
        minValue = 0;
        maxValue = Math.pow(2, bitWidth) - 1;
    } else if (typePrefix === 'I') {
        maxValue = Math.pow(2, bitWidth - 1) - 1;
        minValue = -Math.pow(2, bitWidth - 1);
    } else {
        return null;
    }
    
    return { minValue, maxValue, typeStr: typePrefix + bitWidth.toString(), bitWidth };
}

function validateValueInConstraint(value: number, constraint: TypeConstraint, source: string): void {
    if (value < constraint.minValue || value > constraint.maxValue) {
        throw new Error(`Value ${value} out of range for ${source}. Expected ${constraint.minValue}-${constraint.maxValue}.`);
    }
}

function validateTypeMatch(exprConstraint: TypeConstraint | null, targetConstraint: TypeConstraint | null): void {
    if (exprConstraint && targetConstraint && exprConstraint.typeStr !== targetConstraint.typeStr) {
        throw new Error(`Type mismatch: cannot assign ${exprConstraint.typeStr} to ${targetConstraint.typeStr}`);
    }
}

function ensureVariableNotDefined(scope: Record<string, unknown>, varName: string): void {
    if (scope[varName] !== undefined) {
        throw new Error(`Variable ${varName} is already defined.`);
    }
}

function ensureBoolOperand(result: EvaluationResult, operator: string | undefined, side: string): void {
    if (result.constraint?.typeStr !== 'Bool') {
        throw new Error(`Logical operator ${operator || 'unknown'} requires boolean operands, but ${side} side is ${result.constraint?.typeStr || 'numeric'}`);
    }
}

function ensureNumericOperand(result: EvaluationResult, operator: string | undefined, side: string): void {
    if (result.constraint?.typeStr === 'Bool') {
        throw new Error(`Arithmetic operator ${operator || 'unknown'} requires numeric operands, but ${side} side is Bool`);
    }
}

function updateDepth(char: string, depth: number): number {
    if (char === '(' || char === '{') return depth + 1;
    if (char === ')' || char === '}') return depth - 1;
    return depth;
}

const addresses: Map<number, string> = new Map();
let nextAddress = 0x1000;

function getAddressOf(varName: string): number {
    for (const [addr, name] of addresses.entries()) {
        if (name === varName) return addr;
    }
    const addr = nextAddress++;
    addresses.set(addr, varName);
    return addr;
}

export function interpret(source : string, scope: Record<string, { value: number, constraint: TypeConstraint | null, isMutable?: boolean, isInitialized?: boolean }> = {}) : number {
    addresses.clear();
    nextAddress = 0x1000;
    return evaluate(source, scope).value;
}

interface EvaluationResult {
    value: number;
    constraint: TypeConstraint | null;
}

function evaluate(source: string, scope: Record<string, { value: number, constraint: TypeConstraint | null, isMutable?: boolean, isInitialized?: boolean }>): EvaluationResult {
    source = source.trim();
    if (source === 'true') {
        return { value: 1, constraint: { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 } };
    }
    if (source === 'false') {
        return { value: 0, constraint: { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 } };
    }

    // Check for pointer reference: &x or &mut x
    if (source.startsWith('&')) {
        let isMutableRequest = false;
        let varName = source.substring(1).trim();
        if (varName.startsWith('mut ')) {
            isMutableRequest = true;
            varName = varName.substring(4).trim();
        }
        
        const existingVar = scope[varName];
        if (existingVar) {
            if (isMutableRequest && !existingVar.isMutable) {
                throw new Error(`Cannot take mutable reference to immutable variable ${varName}`);
            }
            const addr = getAddressOf(varName);
            const innerConstraint = existingVar.constraint || getTypeConstraint("I32");
            return {
                value: addr,
                constraint: {
                    minValue: 0,
                    maxValue: Number.MAX_SAFE_INTEGER,
                    typeStr: '*' + (isMutableRequest ? 'mut ' : '') + (innerConstraint?.typeStr || 'numeric')
                }
            };
        }
        throw new Error(`Cannot take address of undefined variable ${varName}`);
    }

    // Check for pointer dereference: *y
    if (source.startsWith('*') && !getTypeConstraint(source)) {
        const expr = source.substring(1).trim();
        const exprResult = evaluate(expr, scope);
        if (exprResult.constraint?.typeStr.startsWith('*')) {
            const addr = exprResult.value;
            const varName = addresses.get(addr);
            if (varName && scope[varName]) {
                const targetVar = scope[varName];
                if (!targetVar.isInitialized) {
                    throw new Error(`Dereferenced pointer points to uninitialized variable ${varName}`);
                }
                const isMut = exprResult.constraint.typeStr.startsWith('*mut ');
                const innerTypeStr = exprResult.constraint.typeStr.substring(isMut ? 5 : 1);
                const targetConstraint = getTypeConstraint(innerTypeStr);
                return { value: targetVar.value, constraint: targetConstraint };
            }
            throw new Error(`Invalid pointer address ${addr} for ${varName || 'unknown'}`);
        }
        throw new Error(`Cannot dereference non-pointer type ${exprResult.constraint?.typeStr || 'numeric'} for expr: ${expr}`);
    }

    // Check for if (cond) expr1 else expr2
    if (source.startsWith('if')) {
        // Find opening paren
        const openParenIndex = source.indexOf('(');
        if (openParenIndex > -1) {
            // Find matched closing paren for condition
            let depth = 0;
            let closeParenIndex = -1;
            for (let i = openParenIndex; i < source.length; i++) {
                depth = updateDepth(source[i] as string, depth);
                if (depth === 0) {
                    closeParenIndex = i;
                    break;
                }
            }
            
            if (closeParenIndex > -1) {
                const conditionStr = source.substring(openParenIndex + 1, closeParenIndex).trim();
                const remainder = source.substring(closeParenIndex + 1).trim();
                
                // Now interpret remainder to find 'else'
                // Remainder should be: THEN_BLOCK else ELSE_BLOCK
                
                let thenStr = '';
                let elseStr = '';
                let elseIndex = -1;
                
                // Scan remainder for optional braces or single statement, identifying where 'else' keyword appears AT DEPTH 0
                depth = 0;
                for (let i = 0; i < remainder.length; i++) {
                    const char = remainder[i] as string;
                    
                    // If we hit 'else' at depth 0, we found the split
                    if (depth === 0 && remainder.substring(i).startsWith('else')) {
                         // Verify it's a whole word 'else' (followed by space or { or nothing?)
                         // Usually followed by space or if or {
                         const nextChar = remainder[i + 4];
                         if (!nextChar || /\s|{/.test(nextChar)) {
                             elseIndex = i;
                             break;
                         }
                    }
                    
                    depth = updateDepth(char, depth);
                }
                
                if (elseIndex > -1) {
                    thenStr = remainder.substring(0, elseIndex).trim();
                    elseStr = remainder.substring(elseIndex + 4).trim();
                    
                    const conditionResult = evaluate(conditionStr, scope);
                    ensureBoolOperand(conditionResult, 'if', 'condition');
                    
                    // Re-evaluate both branches but discard result to check types
                    // This is a naive type-checker; real implementation would be better.
                    const thenResult = evaluate(thenStr, { ...scope });
                    const elseResult = evaluate(elseStr, { ...scope });

                    // Ensure branch types are compatible
                    const thenType = thenResult.constraint?.typeStr || 'numeric';
                    const elseType = elseResult.constraint?.typeStr || 'numeric';

                    if (thenType !== elseType) {
                        throw new Error(`Type mismatch in if branches: then branch is ${thenType}, else branch is ${elseType}`);
                    }

                    if (conditionResult.value !== 0) {
                        // Now evaluate the branch that actually runs with the REAL scope
                        return evaluate(thenStr, scope);
                    } else {
                        return evaluate(elseStr, scope);
                    }
                }
            }
        }
    }
    
    // Check for fully wrapped expression (parens or braces) logic has been moved to be handled last if nothing else matches?
    // Actually, handling it here is correct for nesting.
    // The previous implementation had it here AND at the end.
    // The previous implementation was:
    // 1. Check constants/pointers/if
    // 2. Check blocks (braces specifically)
    // 3. Check splits (semicolons)
    // 4. (Recursively called on parts)
    
    // BUT there was ALSO a check at the end "Remove outermost ... if isFullyWrapped".
    // This seems redundant if we check it here?
    // Actually, we should check it BEFORE checking for splits if it wraps the WHOLE string and wasn't picked up by "if" or "let".
    
    // Let's remove the second copy at the end of the file (lines 428ish in original)
    // and rely on one robust check.
    
    // Consolidated wrap check
    if ((source.startsWith('(') && source.endsWith(')')) || (source.startsWith('{') && source.endsWith('}'))) {
        const startChar = source[0];
        let depth = 0;
        let isFullyWrapped = true;
        for (let i = 0; i < source.length - 1; i++) {
            const char = source[i];
            if (char === undefined) break; 
            depth = updateDepth(char, depth);
            if (depth === 0) {
                isFullyWrapped = false;
                break;
            }
        }
        // Only unwrap if it's NOT a complex statement block that we just handled with splitPoints?
        // Wait, splitPoints logic COMES AFTER this in current flow.
        
        if (isFullyWrapped) {
            const inner = source.substring(1, source.length - 1).trim();
            if (startChar === '{' && inner.length === 0) return { value: 0, constraint: null };
            return evaluate(inner, scope);
        }
    }
    
    // Check if this is a block with statements (semicolons or self-terminating blocks) NOT inside parentheses/braces at depth 0
    let splitDepth = 0;
    const splitPoints: number[] = [];
    for (let i = 0; i < source.length; i++) {
        const char = source[i] as string;
        const prevDepth = splitDepth;
        splitDepth = updateDepth(char, splitDepth);
        if (char === ';' && splitDepth === 0) {
             let next = i + 1;
             while (next < source.length && /\s/.test(source[next] as string)) next++;
             const rest = source.substring(next);
             if (!rest.startsWith('else')) {
                 splitPoints.push(i);
             }
        } else if (char === '}' && splitDepth === 0 && prevDepth === 1 && i < source.length - 1) {
            let next = i + 1;
            while (next < source.length && /\s/.test(source[next] as string)) next++;
            if (next < source.length) {
                const nextChar = source[next];
                const rest = source.substring(next);
                if (nextChar !== ';' && !/[+\-*/&|<>=!]/.test(nextChar as string) && !rest.startsWith('else')) {
                    splitPoints.push(i);
                }
            }
        }
    }

    if (splitPoints.length > 0) {
        const statements: string[] = [];
        let start = 0;
        for (const point of splitPoints) {
            const isSemicolon = source[point] === ';';
            statements.push(source.substring(start, isSemicolon ? point : point + 1).trim());
            start = point + 1;
        }
        statements.push(source.substring(start).trim());

        let lastResult: EvaluationResult = { value: 0, constraint: null };
        const localScope = { ...scope };
        
        for (const statement of statements) {
            if (statement.length === 0) {
                lastResult = { value: 0, constraint: null };
                continue;
            }
            if (statement.startsWith('let ')) {
                // Parse variable declaration: let [mut] x [: TYPE] [= EXPR]
                const declMatch = statement.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*([\w\*\s]+?))?(\s*=\s*(.*))?$/);
                if (declMatch && declMatch[2]) {
                    const isMutable = !!declMatch[1];
                    const varName = declMatch[2];
                    const typeStr = declMatch[3];
                    const hasInitializer = !!declMatch[4];
                    const expr = declMatch[5];
                    const explicitConstraint = typeStr ? getTypeConstraint(typeStr) : null;
                    
                    if (hasInitializer && expr !== undefined) {
                        // Create a "pending" scope for evaluating the initializer
                        const initializerScope = { ...localScope };
                        initializerScope[varName] = { value: NaN, constraint: null, isMutable, isInitialized: false }; // Placeholder
                        
                        const exprResult = evaluate(expr, initializerScope);
                        
                        if (explicitConstraint) {
                            validateValueInConstraint(exprResult.value, explicitConstraint, statement);
                            // Strict type matching for anything that has a constraint (literals or variables)
                            if (exprResult.constraint) {
                                validateTypeMatch(exprResult.constraint, explicitConstraint);
                            }
                        }
                        
                        // Re-check if it was already in localScope (to prevent multiple lets of same name in same block)
                        ensureVariableNotDefined(localScope, varName);

                        const finalConstraint = explicitConstraint || exprResult.constraint || getTypeConstraint("I32");
                        localScope[varName] = { value: exprResult.value, constraint: finalConstraint, isMutable, isInitialized: true };
                        
                        // IF this variable was in the original outer scope, update it there too
                        if (scope[varName]) {
                            scope[varName].value = exprResult.value;
                            scope[varName].isInitialized = true;
                        }

                        lastResult = exprResult;
                    } else {
                        // Declaration without initializer
                        ensureVariableNotDefined(localScope, varName);
                        localScope[varName] = { value: NaN, constraint: explicitConstraint, isMutable, isInitialized: false };
                        lastResult = { value: 0, constraint: null };
                    }
                }
            } else {
                // Check for pointer assignment: *p = EXPR
                const ptrAssignMatch = statement.match(/^\*(.*)\s*=\s*(.*)$/);
                if (ptrAssignMatch && ptrAssignMatch[1] && ptrAssignMatch[2]) {
                    const ptrExpr = ptrAssignMatch[1].trim();
                    const valExpr = ptrAssignMatch[2].trim();
                    const ptrResult = evaluate(ptrExpr, localScope);
                    
                    if (ptrResult.constraint?.typeStr.startsWith('*mut ')) {
                        const addr = ptrResult.value;
                        const varName = addresses.get(addr);
                        if (varName && localScope[varName]) {
                            const valResult = evaluate(valExpr, localScope);
                            const innerTypeStr = ptrResult.constraint.typeStr.substring(5); // skip '*mut '
                            const targetConstraint = getTypeConstraint(innerTypeStr);
                            
                            if (targetConstraint) {
                                validateValueInConstraint(valResult.value, targetConstraint, statement);
                                if (valResult.constraint) {
                                    validateTypeMatch(valResult.constraint, targetConstraint);
                                }
                            }
                            
                            localScope[varName].value = valResult.value;
                            localScope[varName].isInitialized = true;
                            lastResult = valResult;
                            continue;
                        }
                    } else if (ptrResult.constraint?.typeStr.startsWith('*')) {
                        throw new Error(`Cannot assign through non-mutable pointer type ${ptrResult.constraint.typeStr}`);
                    }
                }

                // Check for reassignment: x [OP]= EXPR
                const assignMatch = statement.match(/^([a-zA-Z_]\w*)\s*(\+|-|\*|\/)?=\s*(.*)$/);
                if (assignMatch && assignMatch[1] && assignMatch[3]) {
                    const varName = assignMatch[1];
                    const op = assignMatch[2];
                    const expr = assignMatch[3];
                    const existingVar = localScope[varName];
                    
                    if (existingVar) {
                        if (!existingVar.isMutable && (existingVar.isInitialized || op)) {
                            throw new Error(`Cannot reassign immutable variable ${varName}.`);
                        }
                        
                        if (op && !existingVar.isInitialized) {
                            throw new Error(`Cannot use compound assignment on uninitialized variable ${varName}.`);
                        }

                        const exprResult = evaluate(expr, localScope);
                        let newValue = exprResult.value;

                        if (op) {
                            ensureNumericOperand({ value: existingVar.value, constraint: existingVar.constraint }, op, 'left');
                            ensureNumericOperand(exprResult, op, 'right');
                            
                            switch (op) {
                                case '+': newValue = existingVar.value + exprResult.value; break;
                                case '-': newValue = existingVar.value - exprResult.value; break;
                                case '*': newValue = existingVar.value * exprResult.value; break;
                                case '/': 
                                    if (exprResult.value === 0) throw new Error("Division by zero");
                                    newValue = Math.floor(existingVar.value / exprResult.value); 
                                    break;
                            }
                        }

                        if (existingVar.constraint) {
                            validateValueInConstraint(newValue, existingVar.constraint, statement);
                            // Strict type matching for anything that has a constraint (literals or variables)
                            if (exprResult.constraint && !op) {
                                validateTypeMatch(exprResult.constraint, existingVar.constraint);
                            }
                        }
                        
                        const finalConstraint = existingVar.constraint || exprResult.constraint || getTypeConstraint("I32");
                        const updatedVar = { ...existingVar, value: newValue, isInitialized: true, constraint: finalConstraint };
                        localScope[varName] = updatedVar;
                        
                        // IF this variable was in the original outer scope, update it there too
                        if (scope[varName]) {
                            scope[varName].value = newValue;
                            scope[varName].isInitialized = true;
                        }

                        lastResult = { value: newValue, constraint: finalConstraint };
                        continue;
                    }
                    throw new Error(`Cannot assign to undefined variable ${varName}`);
                }
                lastResult = evaluate(statement, localScope);
            }
        }
        
        // Propagate any changes from localScope back to scope for ALL variables that exist in both
        for (const key in scope) {
            const scopeVar = scope[key];
            const localScopeVar = localScope[key];
            if (scopeVar && localScopeVar) {
                scopeVar.value = localScopeVar.value;
                scopeVar.isInitialized = localScopeVar.isInitialized;
            }
        }

        return lastResult;
    }

    // Check if this is a binary operation
    // Find lowest precedence operator (+ or -) last to ensure left-to-right evaluation
    const findOperator = (regex: RegExp) => {
        const matches = Array.from(source.matchAll(regex));
        // Only return matches that are at depth 0
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            if (!match || match.index === undefined) continue;
            const index = match.index;
            let depth = 0;
            for (let j = 0; j < index; j++) {
                const char = source[j];
                if (char === undefined) break;
                depth = updateDepth(char, depth);
            }
            if (depth === 0) return match;
        }
        return null;
    };

    let operatorMatch = findOperator(/\s*(<|<=|>|>=|==|!=)\s*/g);

    if (!operatorMatch) {
       operatorMatch = findOperator(/\s*(&&|\|\|)\s*/g);
    }

    if (!operatorMatch) {
        operatorMatch = findOperator(/\s*([+\-])\s*/g);
    }
    
    // If no + or -, look for * or /
    if (!operatorMatch) {
        operatorMatch = findOperator(/\s*([*/])\s*/g);
    }

    if (operatorMatch && operatorMatch.index !== undefined) {
        const operator = operatorMatch[1];
        const operatorStart = operatorMatch.index;
        const operatorEnd = operatorStart + operatorMatch[0].length;
        
        const leftStr = source.substring(0, operatorStart).trim();
        const rightStr = source.substring(operatorEnd).trim();
        
        if (leftStr && rightStr) {
            const leftResult = evaluate(leftStr, scope);
            
            if (operator === '&&' || operator === '||') {
                ensureBoolOperand(leftResult, operator, 'left');
            } else {
                ensureNumericOperand(leftResult, operator, 'left');
            }

            // Short-circuiting for logical operators
            if (operator === '&&' && leftResult.value === 0) {
                return { value: 0, constraint: { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 } };
            }
            if (operator === '||' && leftResult.value === 1) {
                return { value: 1, constraint: { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 } };
            }

            const rightResult = evaluate(rightStr, scope);
            
            if (operator === '&&' || operator === '||') {
                ensureBoolOperand(rightResult, operator, 'right');
            } else if (operator === '+' || operator === '-' || operator === '*' || operator === '/') {
                ensureNumericOperand(rightResult, operator, 'right');
            }

            let result: number;
            let resultConstraint: TypeConstraint | null = null;

            switch (operator) {
                case '&&':
                    result = (leftResult.value !== 0 && rightResult.value !== 0) ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '||':
                    result = (leftResult.value !== 0 || rightResult.value !== 0) ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '<':
                    result = leftResult.value < rightResult.value ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '<=':
                    result = leftResult.value <= rightResult.value ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '>':
                    result = leftResult.value > rightResult.value ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '>=':
                    result = leftResult.value >= rightResult.value ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '==':
                    result = leftResult.value === rightResult.value ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '!=':
                    result = leftResult.value !== rightResult.value ? 1 : 0;
                    resultConstraint = { minValue: 0, maxValue: 1, typeStr: 'Bool', bitWidth: 1 };
                    break;
                case '+':
                    result = leftResult.value + rightResult.value;
                    break;
                case '-':
                    result = leftResult.value - rightResult.value;
                    break;
                case '*':
                    result = leftResult.value * rightResult.value;
                    break;
                case '/':
                    if (rightResult.value === 0) {
                        throw new Error("Division by zero");
                    }
                    result = Math.floor(leftResult.value / rightResult.value);
                    break;
                default:
                    return { value: NaN, constraint: null };
            }
            
            if (operator === '&&' || operator === '||') {
                return { value: result, constraint: resultConstraint };
            }
            if (operator === '<' || operator === '<=' || operator === '>' || operator === '>=' || operator === '==' || operator === '!=') {
                return { value: result, constraint: resultConstraint };
            }

            // Infer type constraint from operands
            const leftConstraint = leftResult.constraint;
            const rightConstraint = rightResult.constraint;
            
            // If any operand has a type constraint, validate result
            let constraintToUse: TypeConstraint | null = null;
            
            if (leftConstraint && rightConstraint) {
                // Both have constraints: use the wider one (larger bitwidth)
                constraintToUse = (leftConstraint.bitWidth || 0) >= (rightConstraint.bitWidth || 0) 
                    ? leftConstraint 
                    : rightConstraint;
            } else {
                // One or none has constraint
                constraintToUse = leftConstraint || rightConstraint;
            }
            
            if (constraintToUse) {
                validateValueInConstraint(result, constraintToUse, source);
            }
            
            return { value: result, constraint: constraintToUse };
        }
    }
    
    // Variable access in non-binary expression
    const scopeVar = scope[source];
    if (scopeVar) {
        return { value: scopeVar.value, constraint: scopeVar.constraint };
    }
    
    // If it looks like an identifier but isn't in scope, throw error
    if (/^[a-zA-Z_]\w*$/.test(source)) {
        throw new Error(`Variable ${source} is not defined in the current scope.`);
    }
    
    // Single value parsing
    // Check if there's a type suffix (letters and/or digits after the number)
    const hasSuffix = /[A-Za-z]+\d*$/.test(source.replace(/^-?\d+/, ''));
    const isNegative = source.startsWith('-');
    
    // Check if the type suffix is unsigned (U prefix)
    const isUnsignedSuffix = /^-?\d+U\d*/.test(source);
    
    // Throw error if negative number has an unsigned type suffix
    if (isNegative && isUnsignedSuffix) {
        throw new Error(`Negative number not allowed with unsigned type suffix: ${source}`);
    }
    
    // Extract numeric part at the start
    const match = source.match(/^-?\d+/);
    if (!match) return { value: NaN, constraint: null };
    
    const value = parseInt(match[0], 10);
    const constraint = getTypeConstraint(source);

    // Validate range based on type suffix
    if (hasSuffix) {
        if (constraint) {
            validateValueInConstraint(value, constraint, source);
        }
    }
    
    return { value, constraint };
}