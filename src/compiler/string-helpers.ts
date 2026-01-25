export class StringHelpers {
  static isWhitespace(ch: string | undefined): ch is string {
    return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  }

  static isIdentifierChar(ch: string | undefined): ch is string {
    return (
      ch !== undefined &&
      ((ch >= "a" && ch <= "z") ||
        (ch >= "A" && ch <= "Z") ||
        (ch >= "0" && ch <= "9") ||
        ch === "_")
    );
  }

  static isDigit(ch: string | undefined): ch is string {
    return ch !== undefined && ch >= "0" && ch <= "9";
  }

  static matchWord(source: string, index: number, word: string): boolean {
    if (index + word.length > source.length) {
      return false;
    }
    return source.slice(index, index + word.length) === word;
  }

  static charAt(source: string, index: number): string {
    if (index >= 0 && index < source.length) {
      return source[index]!;
    }
    return "";
  }
}
