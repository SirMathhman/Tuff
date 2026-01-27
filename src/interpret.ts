interface TypeConstraint {
    minValue: number;
    maxValue: number;
    typeStr: string;
    bitWidth?: number;
}

function getTypeConstraint(source: string): TypeConstraint | null {
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
    
    return { minValue, maxValue, typeStr: source.substring(source.match(/\d+$/)?.index || 0), bitWidth };
}

function validateValueInConstraint(value: number, constraint: TypeConstraint, source: string): void {
    if (value < constraint.minValue || value > constraint.maxValue) {
        throw new Error(`Value ${value} out of range for ${source}. Expected ${constraint.minValue}-${constraint.maxValue}.`);
    }
}

function updateDepth(char: string, depth: number): number {
    if (char === '(' || char === '{') return depth + 1;
    if (char === ')' || char === '}') return depth - 1;
    return depth;
}

export function interpret(source : string, scope: Record<string, { value: number, constraint: TypeConstraint | null, isMutable?: boolean }> = {}) : number {
    return evaluate(source, scope).value;
}

interface EvaluationResult {
    value: number;
    constraint: TypeConstraint | null;
}

function evaluate(source: string, scope: Record<string, { value: number, constraint: TypeConstraint | null, isMutable?: boolean }>): EvaluationResult {
    source = source.trim();
    
    // Check if this is a block with statements (semicolons) NOT inside parentheses/braces at depth 0
    let depth = 0;
    let semicolonIndex = -1;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === undefined) break;
        depth = updateDepth(char, depth);
        if (char === ';' && depth === 0) {
            semicolonIndex = i;
            break;
        }
    }

    if (semicolonIndex !== -1) {
        // Split by semicolons at depth 0
        const statements: string[] = [];
        let start = 0;
        let d = 0;
        for (let i = 0; i < source.length; i++) {
            d = updateDepth(source[i] as string, d);
            if (source[i] === ';' && d === 0) {
                statements.push(source.substring(start, i).trim());
                start = i + 1;
            }
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
                // Parse variable declaration: let [mut] x [: TYPE] = EXPR
                const declMatch = statement.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*([UIF]\d+))?\s*=\s*(.*)$/);
                if (declMatch && declMatch[2] && declMatch[4]) {
                    const isMutable = !!declMatch[1];
                    const varName = declMatch[2];
                    const typeStr = declMatch[3];
                    const expr = declMatch[4];
                    const explicitConstraint = typeStr ? getTypeConstraint(typeStr) : null;
                    
                    // Create a "pending" scope for evaluating the initializer
                    const initializerScope = { ...localScope };
                    initializerScope[varName] = { value: NaN, constraint: null, isMutable }; // Placeholder
                    
                    const exprResult = evaluate(expr, initializerScope);
                    
                    if (explicitConstraint) {
                        validateValueInConstraint(exprResult.value, explicitConstraint, statement);
                        // If it's a variable assignment, check strict type matching
                        if (localScope[expr.trim()] && exprResult.constraint) {
                             if (exprResult.constraint.typeStr !== explicitConstraint.typeStr) {
                                  throw new Error(`Type mismatch: cannot assign ${exprResult.constraint.typeStr} to ${explicitConstraint.typeStr}`);
                             }
                        }
                    }
                    
                    // Re-check if it was already in localScope (to prevent multiple lets of same name in same block)
                    if (localScope[varName] !== undefined) {
                        throw new Error(`Variable ${varName} is already defined.`);
                    }

                    const finalConstraint = explicitConstraint || exprResult.constraint;
                    localScope[varName] = { value: exprResult.value, constraint: finalConstraint, isMutable };
                    lastResult = exprResult;
                }
            } else {
                // Check for reassignment: x = EXPR
                const assignMatch = statement.match(/^([a-zA-Z_]\w*)\s*=\s*(.*)$/);
                if (assignMatch && assignMatch[1] && assignMatch[2]) {
                    const varName = assignMatch[1];
                    const expr = assignMatch[2];
                    const existingVar = localScope[varName];
                    
                    if (existingVar) {
                        if (!existingVar.isMutable) {
                            throw new Error(`Cannot reassign immutable variable ${varName}.`);
                        }
                        
                        const exprResult = evaluate(expr, localScope);
                        if (existingVar.constraint) {
                            validateValueInConstraint(exprResult.value, existingVar.constraint, statement);
                        }
                        
                        localScope[varName] = { ...existingVar, value: exprResult.value };
                        lastResult = exprResult;
                        continue;
                    }
                }
                lastResult = evaluate(statement, localScope);
            }
        }
        return lastResult;
    }

    // Remove outermost parentheses or braces if they wrap the entire expression
    if ((source.startsWith('(') && source.endsWith(')')) || (source.startsWith('{') && source.endsWith('}'))) {
        const startChar = source[0];
        const endChar = startChar === '(' ? ')' : '}';
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
        if (isFullyWrapped) {
            return evaluate(source.substring(1, source.length - 1).trim(), scope);
        }
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

    let operatorMatch = findOperator(/\s*([+\-])\s*/g);
    
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
            const rightResult = evaluate(rightStr, scope);
            
            let result: number;
            switch (operator) {
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