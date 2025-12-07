package tuff;

import java.util.HashMap;
import java.util.Map;

public final class Parser {
	private final String s;
	private final int n;
	private int i = 0;

	private Map<String, Operand> locals = new HashMap<>();

	public Parser(String s) {
		this.s = s;
		this.n = s.length();
	}

	public boolean startsWithLet() {
		skipWhitespace();
		return i < n && s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)));
	}

	public boolean hasNext() {
		skipWhitespace();
		return i < n;
	}

	public void skipWhitespace() {
		while (i < n && Character.isWhitespace(s.charAt(i)))
			i++;
	}

	public Operand parseExpression() {
		Operand left = parseTerm();
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			char c = s.charAt(i);
				if (c == '+' || c == '-') {
				i++;
				Operand right = parseTerm();
					if (left.isBoolean != null || right.isBoolean != null) {
						throw new IllegalArgumentException("arithmetic operators require numeric operands");
					}
				java.math.BigInteger value = (c == '+') ? left.value.add(right.value) : left.value.subtract(right.value);
				String[] kind = App.combineKinds(left, right);
				left = new Operand(value, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}

	// logical-and level (&&) - binds looser than arithmetic
	public Operand parseLogicalAnd() {
		Operand left = parseExpression();
		while (true) {
			skipWhitespace();
			if (i + 1 < n && s.charAt(i) == '&' && s.charAt(i + 1) == '&') {
				i += 2;
				Operand right = parseExpression();
				if (left.isBoolean == null || right.isBoolean == null)
					throw new IllegalArgumentException("logical operators require boolean operands");
				boolean lv = !java.math.BigInteger.ZERO.equals(left.value);
				boolean rv = !java.math.BigInteger.ZERO.equals(right.value);
				java.math.BigInteger val = (lv && rv) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO;
				left = new Operand(val, true);
			} else {
				break;
			}
		}
		return left;
	}

	// logical-or level (||)
	public Operand parseLogicalOr() {
		Operand left = parseLogicalAnd();
		while (true) {
			skipWhitespace();
			if (i + 1 < n && s.charAt(i) == '|' && s.charAt(i + 1) == '|') {
				i += 2;
				Operand right = parseLogicalAnd();
				if (left.isBoolean == null || right.isBoolean == null)
					throw new IllegalArgumentException("logical operators require boolean operands");
				boolean lv = !java.math.BigInteger.ZERO.equals(left.value);
				boolean rv = !java.math.BigInteger.ZERO.equals(right.value);
				java.math.BigInteger val = (lv || rv) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO;
				left = new Operand(val, true);
			} else {
				break;
			}
		}
		return left;
	}

	public Operand parseTerm() {
		Operand left = parseFactor();
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			char c = s.charAt(i);
			if (c == '*' || c == '/' || c == '%') {
				i++;
				Operand right = parseFactor();
				if (left.isBoolean != null || right.isBoolean != null) {
					throw new IllegalArgumentException("arithmetic operators require numeric operands");
				}
				java.math.BigInteger computed = App.computeBinaryOp(left.value, right.value, String.valueOf(c));
				String[] kind = App.combineKinds(left, right);
				left = new Operand(computed, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}

	public Operand parseFactor() {
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

		java.util.regex.Matcher boolm = java.util.regex.Pattern.compile("^true|^false").matcher(s.substring(i));
		if (boolm.find()) {
			String b = boolm.group();
			i += b.length();
			return new Operand("true".equals(b) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
		}

		java.util.regex.Matcher m = java.util.regex.Pattern
				.compile("^[+-]?\\d+(?:(?:U|I)(?:8|16|32|64))?")
				.matcher(s.substring(i));
		if (m.find()) {
			String tok = m.group();
			i += tok.length();
			return App.parseOperand(tok);
		}

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
		Map<String, Operand> prev = locals;
		locals = new HashMap<>(prev);
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
				last = parseLogicalOr();
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
		Operand exprVal = parseLogicalOr();
		if (unsignedOrSigned != null && width != null) {
			App.validateRange(exprVal.value.toString(), unsignedOrSigned, width);
		}
		locals.put(name, new Operand(exprVal.value, unsignedOrSigned, width));
		return new Operand(exprVal.value, unsignedOrSigned, width);
	}

	// parse a top-level sequence of statements (let and expressions) ending at EOF
	public Operand parseTopLevelBlock() {
		Map<String, Operand> prev = locals;
		locals = new HashMap<>(prev);
		Operand last = null;
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			if (s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)))) {
				last = parseLetStatement();
			} else {
				last = parseLogicalOr();
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
