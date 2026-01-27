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

export function interpret(source : string) : number {
    source = source.trim();
    
    // Remove outermost parentheses if they wrap the entire expression
    if (source.startsWith('(') && source.endsWith(')')) {
        let depth = 0;
        let isFullyWrapped = true;
        for (let i = 0; i < source.length - 1; i++) {
            if (source[i] === '(') depth++;
            else if (source[i] === ')') depth--;
            if (depth === 0) {
                isFullyWrapped = false;
                break;
            }
        }
        if (isFullyWrapped) {
            return interpret(source.substring(1, source.length - 1).trim());
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
                if (source[j] === '(') depth++;
                else if (source[j] === ')') depth--;
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
            const left = interpret(leftStr);
            const right = interpret(rightStr);
            
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