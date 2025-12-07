package tuff;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses let statements including mutable variable declarations.
 */
final class LetStatementParser {
	private final Parser parser;
	private final Map<String, Operand> locals;
	private final Map<String, Boolean> mutables;
	private final Map<String, Parser.DeclaredType> declaredTypes;

	LetStatementParser(Parser parser) {
		this.parser = parser;
		this.locals = parser.getLocals();
		this.mutables = parser.getMutables();
		this.declaredTypes = parser.getDeclaredTypes();
	}

	Operand parseLetStatement() {
		parser.consumeKeyword("let");
		parser.skipWhitespace();
		boolean isMutable = false;
		if (parser.startsWithKeyword("mut")) {
			isMutable = true;
			parser.consumeKeyword("mut");
			parser.skipWhitespace();
		}
		String name = readIdentifier();
		if (name == null) {
			throw new IllegalArgumentException("invalid identifier in let");
		}
		if (locals.containsKey(name)) {
			throw new IllegalArgumentException("duplicate let declaration: " + name);
		}
		parser.skipWhitespace();
		Parser.DeclaredType dt = null;
		if (parser.peekChar() == ':') {
			parser.consumeChar();
			parser.skipWhitespace();
			dt = readDeclaredType();
		}
		parser.skipWhitespace();
		// initializer is optional when a type is declared (allow declaration without
		// initializer)
		if (parser.peekChar() == '=') {
			parser.consumeChar();
			Operand exprVal = parser.parseLogicalOr();
			Operand res = applyDeclaredType(name, dt, exprVal);
			mutables.put(name, isMutable);
			return res;
		} else {
			if (dt == null) {
				throw new IllegalArgumentException("missing = in let");
			}
			// no initializer but typed declaration -> record declared type and mutability
			declaredTypes.put(name, dt);
			mutables.put(name, isMutable);
			return new Operand(java.math.BigInteger.ZERO, dt.unsignedOrSigned, dt.width);
		}
	}

	private String readIdentifier() {
		Matcher idm = Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
		if (!idm.find()) {
			return null;
		}
		String name = idm.group();
		parser.consumeKeyword(name);
		return name;
	}

	private Parser.DeclaredType readDeclaredType() {
		Parser.DeclaredType dt = new Parser.DeclaredType();
		Matcher tm = Pattern.compile("^(?:U|I)(?:8|16|32|64)").matcher(parser.remainingInput());
		Matcher bm = Pattern.compile("^Bool").matcher(parser.remainingInput());
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			parser.consumeKeyword(type);
		} else if (bm.find()) {
			dt.isBool = true;
			parser.consumeKeyword("Bool");
		} else {
			throw new IllegalArgumentException("invalid type in let");
		}
		return dt;
	}

	private Operand applyDeclaredType(String name, Parser.DeclaredType dt, Operand exprVal) {
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
