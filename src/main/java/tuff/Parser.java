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

	// equality level (==, !=) - binds looser than additive but tighter than
	// logical-and
	Operand parseEquality() {
		Operand left = parseExpression();
		while (true) {
			skipWhitespace();
			String op = readEqualityOperator();
			if (op == null)
				break;
			Operand right = parseExpression();
			left = computeEqualityOp(left, right, op);
		}
		return left;
	}

	private String readEqualityOperator() {
		skipWhitespace();
		if (i + 1 < n) {
			String two = s.substring(i, i + 2);
			if ("==".equals(two) || "!=".equals(two) || "<=".equals(two) || ">=".equals(two)) {
				i += 2;
				return two;
			}
		}
		if (i < n) {
			char c = s.charAt(i);
			if (c == '<' || c == '>') {
				i++;
				return String.valueOf(c);
			}
		}
		return null;
	}

	private Operand computeEqualityOp(Operand left, Operand right, String op) {
		if ("==".equals(op) || "!=".equals(op)) {
			return computeEqualityEqOp(left, right, op);
		}
		return computeRelationalOp(left, right, op);
	}

	private Operand computeEqualityEqOp(Operand left, Operand right, String op) {
		if ((left.isBoolean != null && right.isBoolean == null) || (left.isBoolean == null && right.isBoolean != null)) {
			throw new IllegalArgumentException("equality requires operands of same kind");
		}
		boolean eq = left.value.equals(right.value);
		boolean result = "==".equals(op) ? eq : !eq;
		return new Operand(result ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
	}

	private Operand computeRelationalOp(Operand left, Operand right, String op) {
		if (left.isBoolean != null || right.isBoolean != null) {
			throw new IllegalArgumentException("relational operators require numeric operands");
		}
		int cmp = left.value.compareTo(right.value);
		boolean res;
		switch (op) {
			case "<":
				res = cmp < 0;
				break;
			case "<=":
				res = cmp <= 0;
				break;
			case ">":
				res = cmp > 0;
				break;
			case ">=":
				res = cmp >= 0;
				break;
			default:
				throw new IllegalArgumentException("unknown operator " + op);
		}
		return new Operand(res ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
	}

	// logical-and level (&&) - binds looser than equality
	public Operand parseLogicalAnd() {
		Operand left = parseEquality();
		while (true) {
			skipWhitespace();
			if (i + 1 < n && s.charAt(i) == '&' && s.charAt(i + 1) == '&') {
				i += 2;
				Operand right = parseEquality();
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
		// support if-expression: if (cond) expr else expr
		if (i + 1 < n && s.startsWith("if", i) && (i + 2 == n || !Character.isJavaIdentifierPart(s.charAt(i + 2)))) {
			return parseIfExpression();
		}

		// support match-expression: match <expr> { case <pat> => <expr>; ... }
		if (i + 4 < n && s.startsWith("match", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			return parseMatchExpression();
		}

		Operand paren = parseParenthesized();
		if (paren != null)
			return paren;

		Operand block = parseBlockStart();
		if (block != null)
			return block;

		Operand boolLit = parseBooleanLiteral();
		if (boolLit != null)
			return boolLit;

		Operand num = parseNumberToken();
		if (num != null)
			return num;

		Operand id = parseIdentifierLookup();
		if (id != null)
			return id;

		throw new IllegalArgumentException("invalid token at position " + i);
	}

	private Operand parseBooleanLiteral() {
		skipWhitespace();
		if (s.startsWith("true", i) && (i + 4 == n || !Character.isJavaIdentifierPart(s.charAt(i + 4)))) {
			i += 4;
			return new Operand(java.math.BigInteger.ONE, true);
		}
		if (s.startsWith("false", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			i += 5;
			return new Operand(java.math.BigInteger.ZERO, true);
		}
		return null;
	}

	private Operand parseNumberToken() {
		skipWhitespace();
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?")
				.matcher(s.substring(i));
		if (!m.find())
			return null;
		String number = m.group(1);
		String unsignedOrSigned = m.group(2);
		String width = m.group(3);
		int len = m.group(0).length();
		i += len;
		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}
		if (width != null) {
			App.validateRange(number, unsignedOrSigned, width);
			return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
		}
		return new Operand(new java.math.BigInteger(number), null, null);
	}

	private Operand parseIdentifierLookup() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		i += name.length();
		if (!locals.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		return locals.get(name);
	}

	private Operand parseParenthesized() {
		if (i < n && s.charAt(i) == '(') {
			i++; // consume '('
			Operand inner = parseExpression();
			skipWhitespace();
			if (i >= n || s.charAt(i) != ')')
				throw new IllegalArgumentException("mismatched parentheses");
			i++; // consume ')'
			return inner;
		}
		return null;
	}

	private Operand parseBlockStart() {
		if (i < n && s.charAt(i) == '{') {
			return parseBlock();
		}
		return null;
	}

	private Operand parseIfExpression() {
		i += 2; // consume 'if'
		Operand cond = parseIfCondition();
		Operand thenOp = parseLogicalOr();
		parseElseKeyword();
		Operand elseOp = parseLogicalOr();
		return computeIfResult(cond, thenOp, elseOp);
	}

	private static final class MatchArm {
		final boolean isWildcard;
		final Operand pattern; // null when wildcard
		final Operand result;

		MatchArm(boolean isWildcard, Operand pattern, Operand result) {
			this.isWildcard = isWildcard;
			this.pattern = pattern;
			this.result = result;
		}
	}

	private Operand parseMatchExpression() {
		i += 5; // consume 'match'
		skipWhitespace();
		Operand control = parseLogicalOr();
		skipWhitespace();
		if (i >= n || s.charAt(i) != '{')
			throw new IllegalArgumentException("expected '{' after match expression");
		i++; // consume '{'
		java.util.List<MatchArm> arms = parseMatchArms();
		Boolean armsAreBoolean = determineArmsAreBoolean(arms);
		MatchArm chosen = findMatchArm(control, arms);
		return computeMatchResult(chosen, arms, armsAreBoolean);
	}

	private java.util.List<MatchArm> parseMatchArms() {
		java.util.List<MatchArm> arms = new java.util.ArrayList<>();
		while (true) {
			skipWhitespace();
			if (i >= n)
				throw new IllegalArgumentException("mismatched brace in match expression");
			if (s.charAt(i) == '}') {
				i++; // consume '}'
				break;
			}
			arms.add(parseSingleMatchArm());
		}
		if (arms.isEmpty())
			throw new IllegalArgumentException("match with no arms");
		return arms;
	}

	private MatchArm parseSingleMatchArm() {
		if (!s.startsWith("case", i) || (i + 4 < n && Character.isJavaIdentifierPart(s.charAt(i + 4))))
			throw new IllegalArgumentException("expected 'case' in match expression");
		i += 4; // consume 'case'
		skipWhitespace();
		boolean isWildcard = false;
		Operand patt = null;
		if (i < n && s.charAt(i) == '_') {
			isWildcard = true;
			i++; // consume '_'
		} else {
			patt = parseBooleanLiteral();
			if (patt == null)
				patt = parseNumberToken();
			if (patt == null)
				throw new IllegalArgumentException("invalid match pattern");
		}
		skipWhitespace();
		if (!(i + 1 < n && s.charAt(i) == '=' && s.charAt(i + 1) == '>'))
			throw new IllegalArgumentException("expected '=>' in match arm");
		i += 2; // consume '=>'
		Operand res = parseLogicalOr();
		skipWhitespace();
		if (i < n && s.charAt(i) == ';') {
			i++; // consume ';'
			return new MatchArm(isWildcard, patt, res);
		}
		// allow '}' next
		skipWhitespace();
		if (i < n && s.charAt(i) == '}') {
			return new MatchArm(isWildcard, patt, res);
		}
		throw new IllegalArgumentException("expected ';' or '}' in match expression");
	}

	private Boolean determineArmsAreBoolean(java.util.List<MatchArm> arms) {
		Boolean armsAreBoolean = null;
		for (MatchArm a : arms) {
			if (armsAreBoolean == null) {
				armsAreBoolean = a.result.isBoolean != null;
			} else {
				if (armsAreBoolean != (a.result.isBoolean != null))
					throw new IllegalArgumentException("match arms must be same kind");
			}
		}
		return armsAreBoolean;
	}

	private MatchArm findMatchArm(Operand control, java.util.List<MatchArm> arms) {
		for (MatchArm a : arms) {
			if (a.isWildcard) {
				return a;
			}
			if (a.pattern != null) {
				if (a.pattern.isBoolean != null) {
					if (control.isBoolean == null)
						continue;
					if (control.value.equals(a.pattern.value))
						return a;
				} else {
					if (control.isBoolean != null)
						continue;
					if (control.value.equals(a.pattern.value))
						return a;
				}
			}
		}
		return null;
	}

	private Operand computeMatchResult(MatchArm chosen, java.util.List<MatchArm> arms, Boolean armsAreBoolean) {
		if (chosen == null)
			throw new IllegalArgumentException("no match arm found and no wildcard present");
		if (!armsAreBoolean) {
			String[] kind = new String[] { null, null };
			for (MatchArm a : arms) {
				if (a.result.unsignedOrSigned != null && a.result.width != null) {
					if (kind[0] == null && kind[1] == null) {
						kind[0] = a.result.unsignedOrSigned;
						kind[1] = a.result.width;
					} else if (!kind[0].equals(a.result.unsignedOrSigned) || !kind[1].equals(a.result.width)) {
						throw new IllegalArgumentException("mixed typed match arm results not supported");
					}
				}
			}
			if (kind[0] != null && kind[1] != null) {
				App.validateRange(chosen.result.value.toString(), kind[0], kind[1]);
				return new Operand(chosen.result.value, kind[0], kind[1]);
			}
			return new Operand(chosen.result.value, null, null);
		}
		return new Operand(chosen.result.value, true);
	}

	private Operand parseIfCondition() {
		skipWhitespace();
		if (i >= n || s.charAt(i) != '(')
			throw new IllegalArgumentException("expected '(' after if");
		i++; // consume '('
		Operand cond = parseLogicalOr();
		skipWhitespace();
		if (i >= n || s.charAt(i) != ')')
			throw new IllegalArgumentException("expected ')' after if condition");
		i++; // consume ')'
		skipWhitespace();
		return cond;
	}

	private void parseElseKeyword() {
		skipWhitespace();
		if (!s.startsWith("else", i) || (i + 4 < n && Character.isJavaIdentifierPart(s.charAt(i + 4))))
			throw new IllegalArgumentException("expected 'else' in if-expression");
		i += 4; // consume 'else'
		skipWhitespace();
	}

	private Operand computeIfResult(Operand cond, Operand thenOp, Operand elseOp) {
		// condition must be boolean
		if (cond.isBoolean == null)
			throw new IllegalArgumentException("if condition must be boolean");

		// branches must be same kind (both boolean or both numeric)
		if ((thenOp.isBoolean != null && elseOp.isBoolean == null)
				|| (thenOp.isBoolean == null && elseOp.isBoolean != null)) {
			throw new IllegalArgumentException("if branches must be same kind");
		}

		if (thenOp.isBoolean != null) {
			// both boolean -> pick based on cond
			boolean c = !java.math.BigInteger.ZERO.equals(cond.value);
			return new Operand(c ? thenOp.value : elseOp.value, true);
		}

		// numeric branches
		String[] kind = App.combineKinds(thenOp, elseOp);
		java.math.BigInteger chosen = !java.math.BigInteger.ZERO.equals(cond.value) ? thenOp.value : elseOp.value;
		if (kind[0] != null && kind[1] != null) {
			App.validateRange(chosen.toString(), kind[0], kind[1]);
		}
		return new Operand(chosen, kind[0], kind[1]);
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
		DeclaredType dt = null;
		if (i < n && s.charAt(i) == ':') {
			i++; // consume ':'
			skipWhitespace();
			dt = readDeclaredType();
		}
		skipWhitespace();
		if (i >= n || s.charAt(i) != '=')
			throw new IllegalArgumentException("missing = in let");
		i++; // consume '='
		Operand exprVal = parseLogicalOr();
		return applyDeclaredType(name, dt, exprVal);
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

	private static final class DeclaredType {
		boolean isBool;
		String unsignedOrSigned;
		String width;
	}

	private DeclaredType readDeclaredType() {
		DeclaredType dt = new DeclaredType();
		java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64)").matcher(s.substring(i));
		java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(s.substring(i));
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			i += type.length();
		} else if (bm.find()) {
			dt.isBool = true;
			i += 4; // length of "Bool"
		} else {
			throw new IllegalArgumentException("invalid type in let");
		}
		return dt;
	}

	private Operand applyDeclaredType(String name, DeclaredType dt, Operand exprVal) {
		if (dt != null && dt.isBool) {
			if (exprVal.isBoolean == null) {
				throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
			}
			locals.put(name, new Operand(exprVal.value, true));
			return new Operand(exprVal.value, true);
		}
		if (dt != null && dt.unsignedOrSigned != null && dt.width != null) {
			if (exprVal.isBoolean != null) {
				throw new IllegalArgumentException("typed numeric assignment requires numeric operand");
			}
			if (exprVal.unsignedOrSigned != null && exprVal.width != null) {
				if (!dt.unsignedOrSigned.equals(exprVal.unsignedOrSigned) || !dt.width.equals(exprVal.width)) {
					throw new IllegalArgumentException("mismatched typed assignment");
				}
			}
			App.validateRange(exprVal.value.toString(), dt.unsignedOrSigned, dt.width);
		}
		String signed = dt != null ? dt.unsignedOrSigned : null;
		String w = dt != null ? dt.width : null;
		locals.put(name, new Operand(exprVal.value, signed, w));
		return new Operand(exprVal.value, signed, w);
	}
}
