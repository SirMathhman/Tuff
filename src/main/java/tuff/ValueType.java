package tuff;

import java.math.BigInteger;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utility class for handling typed integer values and operand parsing.
 * Encapsulates the Value inner class and operand validation logic.
 */
public final class ValueType {

	/** Value wrapper holding a BigInteger and its type token. */
	public static final class Value {
		public final BigInteger value;
		public final String token;

		public Value(BigInteger value, String token) {
			this.value = value;
			this.token = token;
		}
	}

	/**
	 * Parse an operand (number, identifier, or block) and return its typed Value.
	 * Validates ranges and looks up variables in context.
	 */
	public static Value parseOperandAndValidate(String operand, Map<String, Value> ctx) {
		// block operand - delegated to App
		if (operand != null && operand.startsWith("{")) {
			return App.evaluateBlock(operand, ctx);
		}

		// identifier (variable reference)
		Pattern ident = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
		if (ident.matcher(operand).matches()) {
			if (ctx != null && ctx.containsKey(operand)) {
				return ctx.get(operand);
			}
			throw new IllegalArgumentException("unknown identifier: " + operand);
		}

		// numeric operand with token
		Pattern p = Pattern.compile("^([+-]?\\d+)(.*)$");
		Matcher m = p.matcher(operand);
		if (!m.find())
			throw new IllegalArgumentException("invalid operand: " + operand);
		String digits = m.group(1);
		String rest = m.group(2).trim();
		String token = extractToken(rest);
		if (token.isEmpty())
			throw new IllegalArgumentException("missing type for operand: " + operand);
		TokenRange.validateTokenRange(token, digits);
		BigInteger val = new BigInteger(normalizeDigits(digits));
		return new Value(val, token);
	}

	private static String extractToken(String suffix) {
		int tokenEnd = 0;
		while (tokenEnd < suffix.length() && Character.isLetterOrDigit(suffix.charAt(tokenEnd))) {
			tokenEnd++;
		}
		return tokenEnd == 0 ? "" : suffix.substring(0, tokenEnd);
	}

	private static String normalizeDigits(String digits) {
		return digits.startsWith("+") ? digits.substring(1) : digits;
	}
}
