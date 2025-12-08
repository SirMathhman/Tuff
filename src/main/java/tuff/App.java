package tuff;

public final class App {
	private static final ThreadLocal<StringBuilder> CAPTURED_OUTPUT = ThreadLocal.withInitial(StringBuilder::new);

	public static void main(String[] args) {
		System.out.println("Hello from Tuff App!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	public static String greet() {
		return "Hello from Tuff App!";
	}

	public static String interpret(String input) {
		// reset captured output for this interpretation run
		CAPTURED_OUTPUT.set(new StringBuilder());
		if (input == null || input.isEmpty()) {
			return "";
		}

		// boolean literal
		String t = input.trim();
		if ("true".equals(t) || "false".equals(t)) {
			return t;
		}

		// single-quoted character literal, e.g. 'a' or '\n'
		if (t.matches("^'([^'\\\\]|\\\\.)'$")) {
			return t;
		}

		// double-quoted string literal, e.g. "value" or "escaped \" quotes"
		if (t.matches("^\"([^\"\\\\]|\\\\.)*\"$")) {
			return t;
		}

		// Try parsing simple expressions containing + and - (left-to-right evaluation).
		String exprResult = tryEvaluateExpression(input);
		if (exprResult != null) {
			return exprResult;
		}

		// Simple addition expressions like "100U8 + 50U8"
		java.util.regex.Matcher addMatcher = java.util.regex.Pattern.compile("^\\s*([-+]?\\S+)\\s*\\+\\s*([-+]?\\S+)\\s*$")
				.matcher(input);
		if (addMatcher.matches()) {
			return evaluateAddition(addMatcher.group(1), addMatcher.group(2));
		}

		if (isSignedInteger(input)) {
			return input;
		}

		java.util.regex.Matcher m = java.util.regex.Pattern
				.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64|Size))?$")
				.matcher(input);
		if (!m.matches()) {
			throw new IllegalArgumentException("interpret: non-empty non-integer input not supported");
		}

		String number = m.group(1);
		String unsignedOrSigned = m.group(2); // either "U" or "I" when present

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		String width = m.group(3); // one of 8,16,32,64 or null
		if (width != null) {
			validateRange(number, unsignedOrSigned, width);
		}

		return number;
	}

	// Helpers for capturing stdout-like output during interpretation
	static void appendCapturedOutput(String s) {
		CAPTURED_OUTPUT.get().append(s);
	}

	static String getCapturedOutput() {
		return CAPTURED_OUTPUT.get().toString();
	}

	/**
	 * Interpret a set of source files where one file is the "main" entry point.
	 */
	public static String interpretAll(String mainScriptName, java.util.Map<String, String> sources) {
		return interpret(SourceCombiner.combine(mainScriptName, sources));
	}

	/**
	 * Convenience overload which assumes the main script key is "main".
	 */
	public static String interpretAll(java.util.Map<String, String> sources) {
		return interpret(SourceCombiner.combine(sources));
	}

	private static boolean isSignedInteger(String s) {
		return s != null && s.matches("[-+]?\\d+");
	}

	private static String evaluateAddition(String left, String right) {
		return evaluateAddition(new String[] { left, right });
	}

	private static String evaluateAddition(String[] parts) {
		java.util.List<Operand> operands = new java.util.ArrayList<>();
		for (String p : parts) {
			operands.add(parseOperand(p));
		}

		java.math.BigInteger sum = java.math.BigInteger.ZERO;
		for (Operand op : operands) {
			sum = sum.add(op.value);
		}

		String onlyType = singleTypedKind(operands);
		if (onlyType != null) {
			String signed = onlyType.substring(0, 1);
			String width = onlyType.substring(1);
			validateRange(sum.toString(), signed, width);
		}

		return sum.toString();
	}

	private static Operand parseOperand(String token) {
		if (token == null)
			throw new IllegalArgumentException("invalid operand: null");
		token = token.trim();
		if ("true".equals(token) || "false".equals(token)) {
			boolean val = "true".equals(token);
			return new Operand(val ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
		}

		if (isSignedInteger(token)) {
			return new Operand(new java.math.BigInteger(token), null, null);
		}

		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64|Size))?$")
				.matcher(token);
		if (!m.matches()) {
			throw new IllegalArgumentException("invalid operand: " + token);
		}

		String number = m.group(1);
		String unsignedOrSigned = m.group(2);
		String width = m.group(3);

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		if (width != null) {
			validateRange(number, unsignedOrSigned, width);
			return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
		}

		return new Operand(new java.math.BigInteger(number), null, null);
	}

	private static String tryEvaluateExpression(String input) {
		try {
			// support simple string concatenation expressions made of only
			// double-quoted literals separated by + (e.g. "a" + "b" + "c")
			if (input != null) {
				String s = input.trim();
				if (!s.isEmpty()) {
					java.util.List<String> parts = new java.util.ArrayList<>();
					boolean inQuotes = false;
					boolean escaping = false;
					int partStart = 0;
					for (int idx = 0; idx < s.length(); idx++) {
						char ch = s.charAt(idx);
						if (escaping) {
							escaping = false;
							continue;
						}
						if (ch == '\\') {
							escaping = true;
							continue;
						}
						if (ch == '"') {
							inQuotes = !inQuotes;
							continue;
						}
						if (ch == '+' && !inQuotes) {
							parts.add(s.substring(partStart, idx));
							partStart = idx + 1;
						}
					}
					if (partStart > 0) {
						parts.add(s.substring(partStart));
					}

					if (!parts.isEmpty()) {
						// if we split by top-level '+' successfully and each part is a
						// quoted string literal, concatenate their inner contents
						java.lang.StringBuilder out = new java.lang.StringBuilder();
						boolean allQuoted = true;
						for (String p : parts) {
							String t = p.trim();
							if (t.length() >= 2 && t.charAt(0) == '"' && t.charAt(t.length() - 1) == '"') {
								// validate internal quotes are escaped
								boolean ok = true;
								boolean esc = false;
								for (int j = 1; j < t.length() - 1; j++) {
									char c = t.charAt(j);
									if (esc) {
										esc = false;
										continue;
									}
									if (c == '\\') {
										esc = true;
										continue;
									}
									if (c == '"') {
										ok = false;
										break;
									}
								}
								if (!ok) {
									allQuoted = false;
									break;
								}
								out.append(t.substring(1, t.length() - 1));
							} else {
								allQuoted = false;
								break;
							}
						}
						if (allQuoted && out.length() > 0) {
							return '"' + out.toString() + '"';
						}
						if (allQuoted && out.length() == 0 && parts.size() > 0) {
							// handle case where parts are empty strings: "" + "" -> ""
							return "\"\"";
						}
					}
				}
			}
			Operand result = parseExpressionToOperand(input);
			String finalResult;
			if (result == null) {
				finalResult = "";
			} else if (result.elements != null) {
				finalResult = "";
			} else if (result.stringValue != null) {
				if (result.isChar != null && result.isChar)
					finalResult = "'" + result.stringValue + "'";
				else
					finalResult = '"' + result.stringValue + '"';
			} else {
				if (result.unsignedOrSigned != null && result.width != null) {
					validateRange(result.value.toString(), result.unsignedOrSigned, result.width);
				}
				if (result.isBoolean != null && result.isBoolean) {
					finalResult = java.math.BigInteger.ONE.equals(result.value) ? "true" : "false";
				} else {
					finalResult = result.value == null ? "" : result.value.toString();
				}
			}

			String captured = getCapturedOutput();
			if (captured != null && !captured.isEmpty()) {
				return captured;
			}

			return finalResult;
		} catch (IllegalArgumentException ex) {
			// propagate known evaluation errors
			throw ex;
		} catch (Exception ex) {
			// parsing failed; not an expression we support
			return null;
		}
	}

	private static Operand parseExpressionToOperand(String input) {
		if (input == null)
			return null;
		Parser p = new Parser(input);
		p.skipWhitespace();
		Operand result;
		// Allow parsing top-level blocks when we have statements: let, while, match,
		// if, or a leading '{'
		if (p.startsWithLet() || p.startsWithKeyword("while") || p.startsWithKeyword("match") || p.startsWithKeyword("if")
				|| p.startsWithKeyword("fn") || p.startsWithKeyword("extern") || p.startsWithKeyword("type")
				|| p.startsWithKeyword("struct") || p.startsWithKeyword("module") || p.peekChar() == '{') {
			result = p.parseTopLevelBlock();
		} else {
			result = p.parseLogicalOr();
			p.skipWhitespace();
			if (p.hasNext()) // leftover tokens -> not a simple expression
				throw new IllegalArgumentException("invalid expression");
		}
		p.skipWhitespace();
		if (p.hasNext()) // leftover tokens -> not a simple expression
			throw new IllegalArgumentException("invalid expression");
		return result;
	}

	static String[] combineKinds(Operand a, Operand b) {
		String aKind = (a.unsignedOrSigned != null && a.width != null) ? a.unsignedOrSigned + a.width : null;
		String bKind = (b.unsignedOrSigned != null && b.width != null) ? b.unsignedOrSigned + b.width : null;
		if (aKind != null && bKind != null) {
			if (!aKind.equals(bKind))
				throw new IllegalArgumentException("mixed typed operands not supported");
			return new String[] { a.unsignedOrSigned, a.width };
		}
		if (aKind != null)
			return new String[] { a.unsignedOrSigned, a.width };
		if (bKind != null)
			return new String[] { b.unsignedOrSigned, b.width };
		return new String[] { null, null };
	}

	private static String singleTypedKind(java.util.List<Operand> operands) {
		java.util.Set<String> typedSet = new java.util.HashSet<>();
		for (Operand op : operands) {
			if (op.unsignedOrSigned != null && op.width != null) {
				typedSet.add(op.unsignedOrSigned + op.width);
			}
		}
		if (typedSet.size() > 1) {
			throw new IllegalArgumentException("mixed typed operands not supported");
		}
		return typedSet.isEmpty() ? null : typedSet.iterator().next();
	}

	static void validateRange(String number, String unsignedOrSigned, String width) {
		java.math.BigInteger value = new java.math.BigInteger(number);
		java.math.BigInteger[] range = rangeFor(unsignedOrSigned, width);
		if (value.compareTo(range[0]) < 0 || value.compareTo(range[1]) > 0) {
			String kind = ("U".equals(unsignedOrSigned) ? "U" : "I") + width;
			throw new IllegalArgumentException("value out of range for " + kind);
		}
	}

	private static java.math.BigInteger[] rangeFor(String unsignedOrSigned, String width) {
		boolean isUnsigned = "U".equals(unsignedOrSigned);
		switch (width) {
			case "8":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO, java.math.BigInteger.valueOf(255) };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(-128), java.math.BigInteger.valueOf(127) };
			case "16":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO, java.math.BigInteger.valueOf(65535) };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(-32768), java.math.BigInteger.valueOf(32767) };
			case "32":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO, new java.math.BigInteger("4294967295") };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(Integer.MIN_VALUE),
						java.math.BigInteger.valueOf(Integer.MAX_VALUE) };
			case "64":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO,
							new java.math.BigInteger("18446744073709551615") };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(Long.MIN_VALUE),
						java.math.BigInteger.valueOf(Long.MAX_VALUE) };
			case "Size":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO,
							new java.math.BigInteger("18446744073709551615") };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(Long.MIN_VALUE),
						java.math.BigInteger.valueOf(Long.MAX_VALUE) };
			default:
				return new java.math.BigInteger[] { java.math.BigInteger.ZERO.negate(), java.math.BigInteger.ZERO };
		}
	}

	static java.math.BigInteger computeBinaryOp(java.math.BigInteger a, java.math.BigInteger b, String op) {
		if (("/".equals(op) || "%".equals(op)) && java.math.BigInteger.ZERO.equals(b)) {
			throw new IllegalArgumentException("division by zero");
		}
		if ("+".equals(op)) {
			return a.add(b);
		}
		if ("-".equals(op)) {
			return a.subtract(b);
		}
		if ("*".equals(op)) {
			return a.multiply(b);
		}
		if ("/".equals(op)) {
			return a.divide(b);
		}
		if ("%".equals(op)) {
			return a.remainder(b);
		}
		throw new IllegalArgumentException("unknown operator " + op);
	}
}
