export function interpret(source : string) : number {
    // Extract numeric part at the start, ignoring type suffixes
    const match = source.match(/^\d+/);
    return match ? parseInt(match[0], 10) : NaN;
}