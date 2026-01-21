package io.github.sirmathhman.tuff.compiler.strings;

/**
 * Utility for handling string escape sequences.
 */
public final class StringEscapeUtils {
	private StringEscapeUtils() {
	}

	/**
	 * Unescapes a string by processing escape sequences.
	 * Returns null if an invalid escape sequence is found.
	 */
	public static String unescape(String escaped) {
		var sb = new StringBuilder();
		for (var i = 0; i < escaped.length(); i++) {
			var c = escaped.charAt(i);
			if (c == '\\' && i + 1 < escaped.length()) {
				var next = escaped.charAt(i + 1);
				switch (next) {
					case '0' -> sb.append('\0');
					case 'n' -> sb.append('\n');
					case 't' -> sb.append('\t');
					case 'r' -> sb.append('\r');
					case '\\' -> sb.append('\\');
					case '"' -> sb.append('"');
					case '\'' -> sb.append('\'');
					default -> {
						return null; // Invalid escape
					}
				}
				i++; // Skip the next character
			} else {
				sb.append(c);
			}
		}
		return sb.toString();
	}
}
