export function interpret(source : string) : number {
    // Check if there's a type suffix (letters and/or digits after the number)
    const hasSuffix = /[A-Za-z]+\d*$/.test(source.replace(/^-?\d+/, ''));
    const isNegative = source.startsWith('-');
    
    // Throw error if negative number has a type suffix
    if (isNegative && hasSuffix) {
        throw new Error(`Negative number not allowed with type suffix: ${source}`);
    }
    
    // Extract numeric part at the start, ignoring type suffixes
    const match = source.match(/^-?\d+/);
    return match ? parseInt(match[0], 10) : NaN;
}