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

	private void parseArrayInside(String inside, DeclaredType dt) {
		String[] parts = inside.split("\\s*;\\s*");
		String elemType = parts[0];
		parseArrayElementType(elemType, dt);

		if (parts.length > 1) {
			parseArrayLength(parts[1], dt);
		}
		if (parts.length > 2) {
			parseArrayCapacity(parts[2], dt);
		}
		validateArrayDimensions(dt);
	}

	private void parseArrayElementType(String elemType, DeclaredType dt) {
		if (elemType.startsWith("Bool")) {
			dt.elemIsBool = true;
		} else if (elemType.matches("^(?:U|I)(?:8|16|32|64|Size)$")) {
			dt.elemUnsignedOrSigned = elemType.substring(0, 1);
			dt.elemWidth = elemType.substring(1);
		} else {
			// treat as type variable like 'T'
			dt.elemTypeVarName = elemType;
		}
	}

	private void parseArrayLength(String part, DeclaredType dt) {
		try {
			dt.arrayLength = Integer.parseInt(part);
		} catch (Exception ex) {
			throw new IllegalArgumentException("invalid array length in type");
		}
	}

	private void parseArrayCapacity(String part, DeclaredType dt) {
		try {
			dt.arrayCapacity = Integer.parseInt(part);
		} catch (Exception ex) {
			throw new IllegalArgumentException("invalid array capacity in type");
		}
	}

	private void validateArrayDimensions(DeclaredType dt) {
		if (dt.arrayCapacity == null && dt.arrayLength != null) {
			dt.arrayCapacity = dt.arrayLength;
		}
		if (dt.arrayCapacity != null && dt.arrayCapacity.intValue() <= 0)
			throw new IllegalArgumentException("invalid array length in type");
		if (dt.arrayLength != null && dt.arrayLength.intValue() < 0)
			throw new IllegalArgumentException("invalid array length in type");
		if (dt.arrayLength != null && dt.arrayCapacity != null
				&& dt.arrayLength.intValue() > dt.arrayCapacity.intValue())
			throw new IllegalArgumentException("invalid array length in type");
	}

	Operand parseLetStatement() {
		parser.consumeKeyword("let");
		parser.skipWhitespace();

		boolean isMutable = parseMutable();
		String name = parseName();
		DeclaredType dt = parseTypeDeclaration(name);

		parser.skipWhitespace();
		// initializer is optional when a type is declared
		if (parser.peekChar() == '=') {
			return handleLetAssignment(name, dt, isMutable);
		}

		return handleLetDeclaration(name, dt, isMutable);
	}

	private Operand handleLetDeclaration(String name, DeclaredType dt, boolean isMutable) {
		// no initializer
		if (dt == null) {
			throw new IllegalArgumentException("missing = in let");
		}

		// typed declaration without initializer: record type/mutability
		declaredTypes.put(name, dt);
		mutables.put(name, isMutable);

		// if it's an array type, create a zero-initialized runtime array
		if (dt.isArray) {
			return initializeArray(name, dt);
		}

		// non-array typed declarations do not create a runtime value yet
		return null;
	}

	private boolean parseMutable() {
		if (parser.startsWithKeyword("mut")) {
			parser.consumeKeyword("mut");
			parser.skipWhitespace();
			return true;
		}
		return false;
	}

	private String parseName() {
		String name = readIdentifier();
		if (name == null) {
			throw new IllegalArgumentException("invalid identifier in let");
		}
		if (locals.containsKey(name)) {
			throw new IllegalArgumentException("duplicate let declaration: " + name);
		}
		return name;
	}

	private DeclaredType parseTypeDeclaration(String name) {
		parser.skipWhitespace();
		if (parser.peekChar() == ':') {
			parser.consumeChar();
			parser.skipWhitespace();
			return readDeclaredType(name);
		}
		return null;
	}

	private Operand handleLetAssignment(String name, DeclaredType dt, boolean isMutable) {
		parser.consumeChar();
		Operand exprVal = parser.parseLogicalOr();
		Operand res = applyDeclaredType(name, dt, exprVal);
		mutables.put(name, isMutable);
		return res;
	}

	private Operand initializeArray(String name, DeclaredType dt) {
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

	private String readIdentifier() {
		Matcher idm = Pattern.compile("^[A-Za-z_]\\w*").matcher(parser.remainingInput());
		if (!idm.find()) {
			return null;
		}
		String name = idm.group();
		parser.consumeKeyword(name);
		return name;
	}

	private DeclaredType readDeclaredType(String varName) {
		DeclaredType dt = new DeclaredType();
		String rem = parser.remainingInput();

		if (tryReadNumericType(dt, rem)) {
			return dt;
		}
		if (tryReadBoolType(dt, rem)) {
			return dt;
		}
		if (tryReadStringType(dt, rem)) {
			return dt;
		}
		if (tryReadArrayType(dt, rem)) {
			return dt;
		}
		if (tryReadFunctionType(dt, varName)) {
			return dt;
		}

		return readAliasType(dt, rem, varName);
	}

	private boolean tryReadNumericType(DeclaredType dt, String rem) {
		Matcher tm = Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			parser.consumeKeyword(type);
			return true;
		}
		return false;
	}

	private boolean tryReadBoolType(DeclaredType dt, String rem) {
		Matcher bm = Pattern.compile("^Bool").matcher(rem);
		if (bm.find()) {
			dt.isBool = true;
			parser.consumeKeyword("Bool");
			return true;
		}
		return false;
	}

	private boolean tryReadArrayType(DeclaredType dt, String rem) {
		Matcher am = Pattern.compile("^\\[\\s*[^\\]]+\\]").matcher(rem);
		if (am.find()) {
			String found = am.group();
			String inside = found.substring(1, found.length() - 1).trim();
			parseArrayInside(inside, dt);
			dt.isArray = true;
			parser.setIndex(parser.getIndex() + found.length());
			return true;
		}
		return false;
	}

	private boolean tryReadFunctionType(DeclaredType dt, String varName) {
		if (parser.peekChar() == '(') {
			// function type like '(I32, Bool) => I32'
			parser.consumeChar();
			parser.skipWhitespace();
			java.util.List<DeclaredType> params = new java.util.ArrayList<>();
			if (parser.peekChar() != ')') {
				while (true) {
					DeclaredType p = readDeclaredType(varName);
					params.add(p);
					parser.skipWhitespace();
					if (parser.peekChar() == ',') {
						parser.consumeChar();
						parser.skipWhitespace();
						continue;
					}
					break;
				}
			}
			if (parser.peekChar() != ')')
				throw new IllegalArgumentException("missing ')' in function type");
			parser.consumeChar();
			parser.skipWhitespace();
			if (!(parser.peekChar() == '=' && parser.getIndex() + 1 < parser.getLength()
					&& parser.charAt(parser.getIndex() + 1) == '>'))
				throw new IllegalArgumentException("missing => in function type");
			parser.consumeArrow();
			parser.skipWhitespace();
			DeclaredType ret = readDeclaredType(varName);
			dt.isFunction = true;
			dt.functionParamTypes = params;
			dt.functionReturnType = ret;
			return true;
		}
		return false;
	}

	private DeclaredType readAliasType(DeclaredType dt, String rem, String varName) {
		// support alias like 'MyInt'
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
		if (!idm.find()) {
			String invalid = rem.trim().isEmpty() ? rem : rem.split("\\s+")[0];
			String guidance = "expected a type like U8, I32, Bool, an array ([T]), a function type, or a defined type alias";
			throw new IllegalArgumentException("invalid type in let: '" + invalid + "' (" + guidance + ")"
					+ (varName != null ? (" for name='" + varName + "'") : ""));
		}
		String alias = idm.group();
		java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
		if (!aliases.containsKey(alias)) {
			java.util.Set<String> keys = aliases.keySet();
			String suggestion = keys.isEmpty() ? "no type aliases are defined" : "known aliases: " + String.join(", ", keys);
			throw new IllegalArgumentException("invalid type in let: unknown type alias '" + alias + "'"
					+ (varName != null ? (" for name='" + varName + "'") : "") + ". " + suggestion);
		}
		DeclaredType found = aliases.get(alias);
		dt.isBool = found.isBool;
		dt.unsignedOrSigned = found.unsignedOrSigned;
		dt.width = found.width;
		dt.isArray = found.isArray;
		dt.elemIsBool = found.elemIsBool;
		dt.elemUnsignedOrSigned = found.elemUnsignedOrSigned;
		dt.elemWidth = found.elemWidth;
		dt.arrayLength = found.arrayLength;
		dt.arrayCapacity = found.arrayCapacity;
		parser.consumeKeyword(alias);
		return dt;
	}

	private Operand applyDeclaredType(String name, DeclaredType dt, Operand exprVal) {
		if (isTypedFunction(dt)) {
			return assignFunction(name, dt, exprVal);
		}
		if (isTypedBool(dt)) {
			return assignBool(name, exprVal);
		}
		if (isTypedArray(dt)) {
			return assignArray(name, dt, exprVal);
		}
		if (isTypedString(dt)) {
			return assignString(name, exprVal);
		}
		if (isTypedNumber(dt)) {
			validateNumericOperand(dt, exprVal);
		}
		if (exprVal.elements != null && dt == null) {
			locals.put(name, exprVal);
			return exprVal;
		}

		// allow assigning string literals or booleans to untyped lets
		if (exprVal.stringValue != null && dt == null) {
			locals.put(name, exprVal);
			return exprVal;
		}

		if (exprVal.isBoolean != null && dt == null) {
			locals.put(name, new Operand(exprVal.value, true));
			return new Operand(exprVal.value, true);
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

	private boolean isTypedString(DeclaredType dt) {
		return dt != null && dt.isString;
	}

	private boolean isTypedFunction(DeclaredType dt) {
		return dt != null && dt.isFunction;
	}

	private Operand assignFunction(String name, DeclaredType dt, Operand exprVal) {
		if (exprVal.functionRef == null)
			throw new IllegalArgumentException("typed function assignment requires function operand");
		FunctionDef fd = exprVal.functionRef;
		validateFunctionParameters(dt, fd);
		validateFunctionReturn(dt, fd);
		locals.put(name, new Operand(exprVal.functionRef, exprVal.functionName));
		return new Operand(exprVal.functionRef, exprVal.functionName);
	}

	private void validateFunctionParameters(DeclaredType dt, FunctionDef fd) {
		java.util.List<DeclaredType> expected = dt.functionParamTypes != null ? dt.functionParamTypes
				: new java.util.ArrayList<>();
		java.util.List<DeclaredType> actual = fd.signature.paramTypes != null ? fd.signature.paramTypes
				: new java.util.ArrayList<>();
		if (expected.size() != actual.size())
			throw new IllegalArgumentException("mismatched function type in assignment");
		// validate parameter types where both sides are specified
		for (int i = 0; i < expected.size(); i++) {
			DeclaredType exp = expected.get(i);
			DeclaredType act = actual.get(i);
			if (exp == null || act == null)
				continue;
			if (exp.isBool != act.isBool)
				throw new IllegalArgumentException("mismatched function parameter types in assignment");
			if (exp.unsignedOrSigned != null && exp.width != null && act.unsignedOrSigned != null
					&& act.width != null) {
				if (!exp.unsignedOrSigned.equals(act.unsignedOrSigned) || !exp.width.equals(act.width))
					throw new IllegalArgumentException("mismatched function parameter types in assignment");
			}
		}
	}

	private void validateFunctionReturn(DeclaredType dt, FunctionDef fd) {
		// return type: require match only if both sides declared
		if (dt.functionReturnType != null && fd.body != null && fd.body.returnType != null) {
			DeclaredType expR = dt.functionReturnType;
			DeclaredType actR = fd.body.returnType;
			if (expR.isBool != actR.isBool)
				throw new IllegalArgumentException("mismatched function return type in assignment");
			if (expR.unsignedOrSigned != null && expR.width != null && actR.unsignedOrSigned != null
					&& actR.width != null) {
				if (!expR.unsignedOrSigned.equals(actR.unsignedOrSigned) || !expR.width.equals(actR.width))
					throw new IllegalArgumentException("mismatched function return type in assignment");
			}
		}
	}

	private Operand assignBool(String name, Operand exprVal) {
		if (exprVal.isBoolean == null) {
			throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
		}
		locals.put(name, new Operand(exprVal.value, true));
		return new Operand(exprVal.value, true);
	}

	private Operand assignString(String name, Operand exprVal) {
		if (exprVal.stringValue == null) {
			throw new IllegalArgumentException("typed String assignment requires string literal");
		}
		locals.put(name, new Operand(exprVal.stringValue));
		return new Operand(exprVal.stringValue);
	}

	private boolean tryReadStringType(DeclaredType dt, String rem) {
		java.util.regex.Matcher sm = java.util.regex.Pattern.compile("^String").matcher(rem);
		if (sm.find()) {
			dt.isString = true;
			parser.consumeKeyword("String");
			return true;
		}
		return false;
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
			TypeUtils.validateRange(el.value.toString(), dt.elemUnsignedOrSigned, dt.elemWidth);
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
		TypeUtils.validateRange(exprVal.value.toString(), dt.unsignedOrSigned, dt.width);
	}

}
