interface TypeConstraint {
    minValue: number;
    maxValue: number;
    typeStr: string;
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
    
    return { minValue, maxValue, typeStr: source.substring(source.match(/\d+$/)?.index || 0) };
}

function validateValueInConstraint(value: number, constraint: TypeConstraint, source: string): void {
    if (value < constraint.minValue || value > constraint.maxValue) {
        throw new Error(`Value ${value} out of range for ${source}. Expected ${constraint.minValue}-${constraint.maxValue}.`);
    }
}

export function interpret(source : string) : number {
    // Check if this is a binary operation
    const operatorMatch = source.match(/\s*([+\-*/])\s*/);
    if (operatorMatch) {
        const operator = operatorMatch[1];
        const parts = source.split(operatorMatch[0]);
        if (parts.length >= 2 && parts[0] && parts[1]) {
            const leftStr = parts[0].trim();
            const rightStr = parts[1].trim();
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
                    result = Math.floor(left / right);
                    break;
                default:
                    return NaN;
            }
            
            // Infer type constraint from operands
            const leftConstraint = getTypeConstraint(leftStr);
            const rightConstraint = getTypeConstraint(rightStr);
            
            // If both operands have type constraints, validate result
            if (leftConstraint && rightConstraint) {
                // Use left operand's constraint for the result
                validateValueInConstraint(result, leftConstraint, source);
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