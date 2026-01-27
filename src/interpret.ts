export function interpret(source : string) : number {
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
        const typeMatch = source.match(/([UIF])(\d+)$/);
        if (typeMatch) {
            const typePrefix = typeMatch[1];
            const bitWidth = parseInt(typeMatch[2], 10);
            
            let minValue: number, maxValue: number;
            
            if (typePrefix === 'U') {
                // Unsigned range: 0 to 2^bitWidth - 1
                minValue = 0;
                maxValue = Math.pow(2, bitWidth) - 1;
            } else if (typePrefix === 'I') {
                // Signed range: -(2^(bitWidth-1)) to 2^(bitWidth-1) - 1
                maxValue = Math.pow(2, bitWidth - 1) - 1;
                minValue = -Math.pow(2, bitWidth - 1);
            } else {
                return value;
            }
            
            if (value < minValue || value > maxValue) {
                throw new Error(`Value ${value} out of range for ${source}. Expected ${minValue}-${maxValue}.`);
            }
        }
    }
    
    return value;
}