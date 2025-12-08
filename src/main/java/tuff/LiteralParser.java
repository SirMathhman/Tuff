package tuff;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Static helper methods for parsing literals (numbers, booleans).
 * Extracted from Parser.java to reduce file complexity.
 */
public final class LiteralParser {

	private LiteralParser() {
		// utility class
	}

	/**
	 * Parse a boolean literal (true or false).
	 */
	static Operand parseBooleanLiteral(Parser parser) {
		parser.skipWhitespace();
		if (parser.startsWithKeyword("true")) {
			parser.consumeKeyword("true");
			return new Operand(java.math.BigInteger.ONE, true);
		}
		if (parser.startsWithKeyword("false")) {
			parser.consumeKeyword("false");
			return new Operand(java.math.BigInteger.ZERO, true);
		}
		return null;
	}

	/**
	 * Parse an array literal like [1, 2, 3]. Elements are parsed as full
	 * expressions.
	 */
	static Operand parseArrayLiteral(Parser parser) {
		parser.skipWhitespace();
		if (parser.peekChar() != '[') {
			return null;
		}
		// consume '['
		parser.consumeChar();
		java.util.List<Operand> elems = new java.util.ArrayList<>();
		parser.skipWhitespace();
		if (parser.peekChar() == ']') {
			// empty array
			parser.consumeChar();
			return new Operand(elems);
		}
		while (true) {
			Operand el = parser.parseLogicalOr();
			elems.add(el);
			parser.skipWhitespace();
			if (parser.peekChar() == ',') {
				parser.consumeChar();
				parser.skipWhitespace();
				continue;
			}
			if (parser.peekChar() == ']') {
				parser.consumeChar();
				break;
			}
			throw new IllegalArgumentException("missing ']' or ',' in array literal");
		}
		return new Operand(elems);
	}

	/**
	 * Parse a number token with optional type annotation (e.g., 42, -100, 255U8,
	 * -128I16).
	 */
	static Operand parseNumberToken(Parser parser) {
		parser.skipWhitespace();
		String remaining = parser.remainingInput();
		Pattern p = Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?");
		Matcher m = p.matcher(remaining);
		if (!m.find())
			return null;

		String number = m.group(1);
		String unsignedOrSigned = m.group(2);
		String width = m.group(3);
		int len = m.group(0).length();
		parser.setIndex(parser.getIndex() + len);

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		if (width != null) {
			App.validateRange(number, unsignedOrSigned, width);
			return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
		}
		return new Operand(new java.math.BigInteger(number), null, null);
	}
}
