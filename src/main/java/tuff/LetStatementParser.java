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
	private final Map<String, DeclaredType> declaredTypes;

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
		DeclaredType dt = null;
		if (parser.peekChar() == ':') {
			parser.consumeChar();
			parser.skipWhitespace();
			dt = readDeclaredType();
		}

		parser.skipWhitespace();
		// initializer is optional when a type is declared
		if (parser.peekChar() == '=') {
			parser.consumeChar();
			Operand exprVal = parser.parseLogicalOr();
			Operand res = applyDeclaredType(name, dt, exprVal);
			mutables.put(name, isMutable);
			return res;
		}

		// no initializer
		if (dt == null) {
			throw new IllegalArgumentException("missing = in let");
		}

		// typed declaration without initializer: record type/mutability
		declaredTypes.put(name, dt);
		mutables.put(name, isMutable);

		// if it's an array type, create a zero-initialized runtime array
		if (dt.isArray) {
			java.util.List<Operand> elems = new java.util.ArrayList<>();
			int len = dt.arrayLength != null ? dt.arrayLength : 0;
			for (int k = 0; k < len; k++) {
				if (dt.elemIsBool) {
					elems.add(new Operand(java.math.BigInteger.ZERO, true));
				} else if (dt.elemUnsignedOrSigned != null && dt.elemWidth != null) {
					elems.add(new Operand(java.math.BigInteger.ZERO, dt.elemUnsignedOrSigned, dt.elemWidth));
				} else {
					elems.add(new Operand(java.math.BigInteger.ZERO, null, null));
				}
			}

			// store fully-initialized array and return its runtime value
			locals.put(name, new Operand(elems, dt));
			return new Operand(elems, dt);
		}

		// non-array typed declarations do not create a runtime value yet
		return null;
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

	private DeclaredType readDeclaredType() {
		DeclaredType dt = new DeclaredType();
		String rem = parser.remainingInput();
		Matcher tm = Pattern.compile("^(?:U|I)(?:8|16|32|64)").matcher(rem);
		Matcher bm = Pattern.compile("^Bool").matcher(rem);
		Matcher am = Pattern.compile("^\\[\\s*(?:U|I)(?:8|16|32|64)\\s*;\\s*\\d+(?:\\s*;\\s*\\d+)?\\s*\\]").matcher(rem);
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			parser.consumeKeyword(type);
		} else if (bm.find()) {
			dt.isBool = true;
			parser.consumeKeyword("Bool");
		} else if (am.find()) {
			String found = am.group();
			// format: [U8; 3] or [U8; 3; 3]
			String inside = found.substring(1, found.length() - 1).trim();
			String[] parts = inside.split("\\s*;\\s*");
			// first part is element type
			String elemType = parts[0];
			if (elemType.startsWith("Bool")) {
				dt.elemIsBool = true;
			} else {
				dt.elemUnsignedOrSigned = elemType.substring(0, 1);
				dt.elemWidth = elemType.substring(1);
			}
			// second part is current length; optional third part is capacity
			try {
				dt.arrayLength = Integer.parseInt(parts[1]);
			} catch (Exception ex) {
				throw new IllegalArgumentException("invalid array length in type");
			}
			if (parts.length > 2) {
				try {
					dt.arrayCapacity = Integer.parseInt(parts[2]);
				} catch (Exception ex) {
					throw new IllegalArgumentException("invalid array capacity in type");
				}
			} else {
				dt.arrayCapacity = dt.arrayLength;
			}
			if (dt.arrayCapacity == null || dt.arrayCapacity.intValue() <= 0) {
				throw new IllegalArgumentException("invalid array length in type");
			}
			if (dt.arrayLength == null || dt.arrayLength.intValue() < 0
					|| dt.arrayLength.intValue() > dt.arrayCapacity.intValue()) {
				throw new IllegalArgumentException("invalid array length in type");
			}
			dt.isArray = true;
			// advance parser index by the length of the matched type token
			parser.setIndex(parser.getIndex() + found.length());
		} else {
			throw new IllegalArgumentException("invalid type in let");
		}
		return dt;
	}

	private Operand applyDeclaredType(String name, DeclaredType dt, Operand exprVal) {
		if (isTypedBool(dt)) {
			return assignBool(name, exprVal);
		}
		if (isTypedArray(dt)) {
			return assignArray(name, dt, exprVal);
		}
		if (isTypedNumber(dt)) {
			validateNumericOperand(dt, exprVal);
		}
		if (exprVal.elements != null && dt == null) {
			locals.put(name, exprVal);
			return exprVal;
		}

		String signed = dt != null ? dt.unsignedOrSigned : null;
		String w = dt != null ? dt.width : null;
		locals.put(name, new Operand(exprVal.value, signed, w));
		return new Operand(exprVal.value, signed, w);
	}

	private boolean isTypedBool(DeclaredType dt) {
		return dt != null && dt.isBool;
	}

	private boolean isTypedArray(DeclaredType dt) {
		return dt != null && dt.isArray;
	}

	private boolean isTypedNumber(DeclaredType dt) {
		return dt != null && dt.unsignedOrSigned != null && dt.width != null;
	}

	private Operand assignBool(String name, Operand exprVal) {
		if (exprVal.isBoolean == null) {
			throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
		}
		locals.put(name, new Operand(exprVal.value, true));
		return new Operand(exprVal.value, true);
	}

	private Operand assignArray(String name, DeclaredType dt, Operand exprVal) {
		if (exprVal.elements == null) {
			throw new IllegalArgumentException("typed array assignment requires array literal");
		}
		if (dt.arrayLength != null && exprVal.elements.size() != dt.arrayLength.intValue()) {
			throw new IllegalArgumentException("array initializer length mismatch");
		}
		exprVal.elements.forEach(el -> validateArrayElement(dt, el));
		Integer cap = dt.arrayCapacity != null ? dt.arrayCapacity : dt.arrayLength;
		DeclaredType runtimeDt = new DeclaredType();
		runtimeDt.arrayCapacity = cap;
		runtimeDt.elemIsBool = dt.elemIsBool;
		runtimeDt.elemUnsignedOrSigned = dt.elemUnsignedOrSigned;
		runtimeDt.elemWidth = dt.elemWidth;
		locals.put(name, new Operand(exprVal.elements, runtimeDt));
		return new Operand(exprVal.elements, runtimeDt);
	}

	private void validateArrayElement(DeclaredType dt, Operand el) {
		if (dt.elemIsBool) {
			if (el.isBoolean == null) {
				throw new IllegalArgumentException("typed Bool array requires boolean elements");
			}
			return;
		}
		if (el.isBoolean != null) {
			throw new IllegalArgumentException("typed numeric array requires numeric elements");
		}
		if (dt.elemUnsignedOrSigned != null && dt.elemWidth != null) {
			if (el.unsignedOrSigned != null && el.width != null) {
				if (!dt.elemUnsignedOrSigned.equals(el.unsignedOrSigned) || !dt.elemWidth.equals(el.width)) {
					throw new IllegalArgumentException("mismatched typed array element assignment");
				}
			}
			App.validateRange(el.value.toString(), dt.elemUnsignedOrSigned, dt.elemWidth);
		}
	}

	private void validateNumericOperand(DeclaredType dt, Operand exprVal) {
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

}
