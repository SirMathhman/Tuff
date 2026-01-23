export function interpret(input: string): number {
    const s = input.trim();
    if (s === "") return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}