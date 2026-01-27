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

export function interpret(source : string, scope: Record<string, { value: number, constraint: TypeConstraint | null }> = {}) : number {
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

        let lastValue = NaN;
        const localScope = { ...scope };
        
        for (const statement of statements) {
            if (statement.startsWith('let ')) {
                // Parse variable declaration: let x : U8 = 2
                const declMatch = statement.match(/^let\s+([a-zA-Z_]\w*)\s*:\s*([UIF]\d+)\s*=\s*(.*)$/);
                if (declMatch && declMatch[1] && declMatch[2] && declMatch[3]) {
                    const varName = declMatch[1];
                    
                    const typeStr = declMatch[2];
                    const expr = declMatch[3];
                    const constraint = getTypeConstraint(typeStr);
                    
                    // Create a "pending" scope for evaluating the initializer
                    // We want to pass a scope that already includes the name to detect shadowing
                    const initializerScope = { ...localScope };
                    initializerScope[varName] = { value: NaN, constraint: null }; // Placeholder
                    
                    const value = interpret(expr, initializerScope);
                    
                    if (constraint) {
                        validateValueInConstraint(value, constraint, statement);
                    }
                    
                    // Re-check if it was already in localScope (to prevent multiple lets of same name in same block)
                    if (localScope[varName] !== undefined) {
                        throw new Error(`Variable ${varName} is already defined.`);
                    }

                    localScope[varName] = { value, constraint };
                    lastValue = value;
                }
            } else if (localScope[statement]) {
                // Variable access
                lastValue = localScope[statement].value;
            } else {
                lastValue = interpret(statement, localScope);
            }
        }
        return lastValue;
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
            return interpret(source.substring(1, source.length - 1).trim(), scope);
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
            const left = interpret(leftStr, scope);
            const right = interpret(rightStr, scope);
            
            let result: number;
            switch (operator) {
                case '+':
                    result = left + right;
                    break;
                case '-':
                    result = left - right;
                    break;
                case '*':
                    result = left * right;
                    break;
                case '/':
                    if (right === 0) {
                        throw new Error("Division by zero");
                    }
                    result = Math.floor(left / right);
                    break;
                default:
                    return NaN;
            }
            
            // Infer type constraint from operands
            const leftConstraint = getTypeConstraint(leftStr);
            const rightConstraint = getTypeConstraint(rightStr);
            
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
            
            return result;
        }
    }
    
    // Variable access in non-binary expression
    const scopeVar = scope[source];
    if (scopeVar) {
        return scopeVar.value;
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
    if (!match) return NaN;
    
    const value = parseInt(match[0], 10);
    
    // Validate range based on type suffix
    if (hasSuffix) {
        const constraint = getTypeConstraint(source);
        if (constraint) {
            validateValueInConstraint(value, constraint, source);
        }
    }
    
    return value;
}