package tuff;

public final class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff App!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	public static String greet() {
		return "Hello from Tuff App!";
	}

	public static String interpret(String input) {
		if (input == null || input.isEmpty()) {
			return "";
		}

		// boolean literal
		String t = input.trim();
		if ("true".equals(t) || "false".equals(t)) {
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
				.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?$")
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

	private static String tryEvaluateExpression(String input) {
		try {
			Operand result = parseExpressionToOperand(input);
			if (result == null)
				return null;
			if (result.unsignedOrSigned != null && result.width != null) {
				validateRange(result.value.toString(), result.unsignedOrSigned, result.width);
			}
			return result.value.toString();
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
		if (p.startsWithLet()) {
			result = p.parseTopLevelBlock();
		} else {
			result = p.parseExpression();
			p.skipWhitespace();
			if (p.hasNext()) // leftover tokens -> not a simple expression
				throw new IllegalArgumentException("invalid expression");
		}
		p.skipWhitespace();
		if (p.hasNext()) // leftover tokens -> not a simple expression
			throw new IllegalArgumentException("invalid expression");
		return result;
	}

	private static final class Parser {
		private final String s;
		private final int n;
		private int i = 0;

		private java.util.Map<String, Operand> locals = new java.util.HashMap<>();

		Parser(String s) {
			this.s = s;
			this.n = s.length();
		}

		boolean startsWithLet() {
			skipWhitespace();
			return i < n && s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)));
		}

		boolean hasNext() {
			skipWhitespace();
			return i < n;
		}

		void skipWhitespace() {
			while (i < n && Character.isWhitespace(s.charAt(i)))
				i++;
		}

		Operand parseExpression() {
			Operand left = parseTerm();
			while (true) {
				skipWhitespace();
				if (i >= n)
					break;
				char c = s.charAt(i);
				if (c == '+' || c == '-') {
					i++;
					Operand right = parseTerm();
					java.math.BigInteger value = (c == '+') ? left.value.add(right.value) : left.value.subtract(right.value);
					String[] kind = combineKinds(left, right);
					left = new Operand(value, kind[0], kind[1]);
				} else {
					break;
				}
			}
			return left;
		}

		Operand parseTerm() {
			Operand left = parseFactor();
			while (true) {
				skipWhitespace();
				if (i >= n)
					break;
				char c = s.charAt(i);
				if (c == '*' || c == '/' || c == '%') {
					i++;
					Operand right = parseFactor();
					java.math.BigInteger computed = computeBinaryOp(left.value, right.value, String.valueOf(c));
					String[] kind = combineKinds(left, right);
					left = new Operand(computed, kind[0], kind[1]);
				} else {
					break;
				}
			}
			return left;
		}

		Operand parseFactor() {
			skipWhitespace();
			if (i < n && s.charAt(i) == '(') {
				i++; // consume '('
				Operand inner = parseExpression();
				skipWhitespace();
				if (i >= n || s.charAt(i) != ')')
					throw new IllegalArgumentException("mismatched parentheses");
				i++; // consume ')'
				return inner;
			}

			if (i < n && s.charAt(i) == '{') {
				return parseBlock();
			}

			// parse number token (may include suffix)
			// try number token
			java.util.regex.Matcher m = java.util.regex.Pattern
					.compile("^[+-]?\\d+(?:(?:U|I)(?:8|16|32|64))?")
					.matcher(s.substring(i));
			if (m.find()) {
				String tok = m.group();
				i += tok.length();
				return parseOperand(tok);
			}

			// try identifier lookup
			java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
			if (idm.find()) {
				String name = idm.group();
				i += name.length();
				Operand val = locals.get(name);
				if (val == null)
					throw new IllegalArgumentException("unknown identifier: " + name);
				return val;
			}

			throw new IllegalArgumentException("invalid token at position " + i);
		}

		// parse a block { ... } with local variable declarations (let) and expression
		// statements
		private Operand parseBlock() {
			i++; // we assume caller found '{'
			java.util.Map<String, Operand> prev = locals;
			locals = new java.util.HashMap<>(prev);
			Operand last = null;
			while (true) {
				skipWhitespace();
				if (i >= n)
					throw new IllegalArgumentException("mismatched brace");
				if (s.charAt(i) == '}') {
					i++; // consume '}'
					break;
				}
				if (s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)))) {
					last = parseLetStatement();
				} else {
					last = parseExpression();
				}
				skipWhitespace();
				if (i < n && s.charAt(i) == ';') {
					i++; // consume ';' and continue
					continue;
				}
				// allow '}' next or an error
				skipWhitespace();
				if (i < n && s.charAt(i) == '}') {
					continue;
				}
				if (i < n && s.charAt(i) != '}')
					throw new IllegalArgumentException("expected ';' or '}' in block");
			}
			locals = prev;
			return last == null ? new Operand(java.math.BigInteger.ZERO, null, null) : last;
		}

		private Operand parseLetStatement() {
			// caller ensures 'let' is present
			i += 3; // consume 'let'
			skipWhitespace();
			java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
			if (!idm.find())
				throw new IllegalArgumentException("invalid identifier in let");
			String name = idm.group();
			i += name.length();

			// reject duplicate declarations in current visible scope
			if (locals.containsKey(name)) {
				throw new IllegalArgumentException("duplicate let declaration: " + name);
			}
			skipWhitespace();
			String unsignedOrSigned = null;
			String width = null;
			if (i < n && s.charAt(i) == ':') {
				i++; // consume ':'
				skipWhitespace();
				java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64)").matcher(s.substring(i));
				if (!tm.find())
					throw new IllegalArgumentException("invalid type in let");
				String type = tm.group();
				unsignedOrSigned = type.substring(0, 1);
				width = type.substring(1);
				i += type.length();
			}
			skipWhitespace();
			if (i >= n || s.charAt(i) != '=')
				throw new IllegalArgumentException("missing = in let");
			i++; // consume '='
			Operand exprVal = parseExpression();
			if (unsignedOrSigned != null && width != null) {
				validateRange(exprVal.value.toString(), unsignedOrSigned, width);
			}
			locals.put(name, new Operand(exprVal.value, unsignedOrSigned, width));
			return new Operand(exprVal.value, unsignedOrSigned, width);
		}

		// parse a top-level sequence of statements (let and expressions) ending at EOF
		private Operand parseTopLevelBlock() {
			java.util.Map<String, Operand> prev = locals;
			locals = new java.util.HashMap<>(prev);
			Operand last = null;
			while (true) {
				skipWhitespace();
				if (i >= n)
					break;
				if (s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)))) {
					last = parseLetStatement();
				} else {
					last = parseExpression();
				}
				skipWhitespace();
				if (i < n && s.charAt(i) == ';') {
					i++; // consume ';' and continue
					continue;
				}
				// if not semicolon, loop will either consume more or end
			}
			locals = prev;
			return last == null ? new Operand(java.math.BigInteger.ZERO, null, null) : last;
		}
	}

	private static String[] combineKinds(Operand a, Operand b) {
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

	private static final class Expr {
		java.util.List<String> tokens = new java.util.ArrayList<>();
		java.util.List<String> ops = new java.util.ArrayList<>();
	}

	private static Expr tokenizeExpression(String s) {
		s = s.trim();
		if (s.isEmpty())
			return null;
		int n = s.length();
		int i = 0;
		Expr expr = new Expr();

		while (i < n) {
			while (i < n && Character.isWhitespace(s.charAt(i)))
				i++;
			if (i >= n)
				break;

			if (expr.tokens.isEmpty() || expr.tokens.size() == expr.ops.size()) {
				java.util.regex.Matcher m = java.util.regex.Pattern
						.compile("^[+-]?\\d+(?:(?:U|I)(?:8|16|32|64))?")
						.matcher(s.substring(i));
				if (!m.find())
					return null;
				String tok = m.group();
				expr.tokens.add(tok);
				i += tok.length();
			} else {
				char c = s.charAt(i);
				if (c == '+' || c == '-' || c == '*' || c == '/' || c == '%') {
					expr.ops.add(String.valueOf(c));
					i++;
				} else {
					return null;
				}
			}
		}

		return expr;
	}

	private static final class Operand {
		final java.math.BigInteger value;
		final String unsignedOrSigned;
		final String width;

		Operand(java.math.BigInteger value, String unsignedOrSigned, String width) {
			this.value = value;
			this.unsignedOrSigned = unsignedOrSigned;
			this.width = width;
		}
	}

	private static Operand parseOperand(String token) {
		token = token.trim();
		if (isSignedInteger(token)) {
			return new Operand(new java.math.BigInteger(token), null, null);
		}

		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?$").matcher(token);
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
		}

		return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
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

	private static void validateRange(String number, String unsignedOrSigned, String width) {
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
			default:
				return new java.math.BigInteger[] { java.math.BigInteger.ZERO.negate(), java.math.BigInteger.ZERO };
		}
	}

	private static java.math.BigInteger computeBinaryOp(java.math.BigInteger a, java.math.BigInteger b, String op) {
		if (("/".equals(op) || "%".equals(op)) && java.math.BigInteger.ZERO.equals(b)) {
			throw new IllegalArgumentException("division by zero");
		}
		if ("*".equals(op)) {
			return a.multiply(b);
		}
		if ("/".equals(op)) {
			return a.divide(b);
		}
		// percent
		return a.remainder(b);
	}
}
