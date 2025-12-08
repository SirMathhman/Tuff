package tuff;

import java.util.ArrayList;
import java.util.List;

final class MatchExpressionParser {
	private final Parser parser;

	MatchExpressionParser(Parser parser) {
		this.parser = parser;
	}

	static final class MatchArm {
		final boolean isWildcard;
		final Operand pattern; // null when wildcard
		final Operand result;

		MatchArm(boolean isWildcard, Operand pattern, Operand result) {
			this.isWildcard = isWildcard;
			this.pattern = pattern;
			this.result = result;
		}
	}

	Operand parseMatchExpression() {
		parser.consumeMatch();
		parser.skipWhitespace();
		Operand control = parser.parseLogicalOr();
		parser.skipWhitespace();
		if (parser.peekChar() != '{')
			throw new IllegalArgumentException("expected '{' after match expression");
		parser.consumeChar(); // consume '{'
		List<MatchArm> arms = parseMatchArms();
		Boolean armsAreBoolean = determineArmsAreBoolean(arms);
		MatchArm chosen = findMatchArm(control, arms);
		return computeMatchResult(chosen, arms, armsAreBoolean);
	}

	private List<MatchArm> parseMatchArms() {
		List<MatchArm> arms = new ArrayList<>();
		while (true) {
			parser.skipWhitespace();
			if (!parser.hasNext())
				throw new IllegalArgumentException("mismatched brace in match expression");
			if (parser.peekChar() == '}') {
				parser.consumeChar(); // consume '}'
				break;
			}
			arms.add(parseSingleMatchArm());
		}
		if (arms.isEmpty())
			throw new IllegalArgumentException("match with no arms");
		return arms;
	}

	private MatchArm parseSingleMatchArm() {
		if (!parser.startsWithKeyword("case"))
			throw new IllegalArgumentException("expected 'case' in match expression");
		parser.consumeKeyword("case");
		parser.skipWhitespace();
		boolean isWildcard = false;
		Operand patt = null;
		if (parser.peekChar() == '_') {
			isWildcard = true;
			parser.consumeChar(); // consume '_'
		} else {
			patt = parser.parseBooleanLiteral();
			if (patt == null)
				patt = parser.parseNumberToken();
			if (patt == null)
				throw new IllegalArgumentException("invalid match pattern");
		}
		parser.skipWhitespace();
		if (!parser.startsWithArrow())
			throw new IllegalArgumentException("expected '=>' in match arm");
		parser.consumeArrow();
		Operand res = parser.parseLogicalOr();
		parser.skipWhitespace();
		if (parser.peekChar() == ';') {
			parser.consumeChar(); // consume ';'
			return new MatchArm(isWildcard, patt, res);
		}
		// allow '}' next
		parser.skipWhitespace();
		if (parser.peekChar() == '}') {
			return new MatchArm(isWildcard, patt, res);
		}
		throw new IllegalArgumentException("expected ';' or '}' in match expression");
	}

	private Boolean determineArmsAreBoolean(List<MatchArm> arms) {
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

	private MatchArm findMatchArm(Operand control, List<MatchArm> arms) {
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

	private Operand computeMatchResult(MatchArm chosen, List<MatchArm> arms, Boolean armsAreBoolean) {
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
				TypeUtils.validateRange(chosen.result.value.toString(), kind[0], kind[1]);
				return new Operand(chosen.result.value, kind[0], kind[1]);
			}
			return new Operand(chosen.result.value, null, null);
		}
		return new Operand(chosen.result.value, true);
	}
}
