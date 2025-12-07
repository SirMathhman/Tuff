package tuff;

import java.util.Map;

final class AssignmentUtils {
	private final Map<String, Operand> locals;
	private final Map<String, Boolean> mutables;
	private final Map<String, Parser.DeclaredType> declaredTypes;

	AssignmentUtils(Map<String, Operand> locals, Map<String, Boolean> mutables,
			Map<String, Parser.DeclaredType> declaredTypes) {
		this.locals = locals;
		this.mutables = mutables;
		this.declaredTypes = declaredTypes;
	}

	void assign(String name, Operand val) {
		// allow assignment to declared-but-uninitialized variable as first assignment
		if (!locals.containsKey(name)) {
			if (!declaredTypes.containsKey(name))
				throw new IllegalArgumentException("undefined variable: " + name);
			assignDeclaredUninitialized(name, val);
			return;
		}

		Boolean isMut = mutables.getOrDefault(name, false);
		if (!isMut)
			throw new IllegalArgumentException("assignment to immutable variable: " + name);

		Operand old = locals.get(name);
		if (old.isBoolean != null && val.isBoolean == null)
			throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
		if (old.isBoolean == null && val.isBoolean != null)
			throw new IllegalArgumentException("typed numeric assignment requires numeric operand");

		if (old.unsignedOrSigned != null && old.width != null) {
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!old.unsignedOrSigned.equals(val.unsignedOrSigned) || !old.width.equals(val.width))
					throw new IllegalArgumentException("mismatched typed assignment");
			}
			App.validateRange(val.value.toString(), old.unsignedOrSigned, old.width);
			locals.put(name, new Operand(val.value, old.unsignedOrSigned, old.width));
		} else {
			locals.put(name, new Operand(val.value, val.unsignedOrSigned, val.width));
		}
	}

	private void assignDeclaredUninitialized(String name, Operand val) {
		Parser.DeclaredType dt = declaredTypes.get(name);
		if (dt != null && dt.isBool) {
			if (val.isBoolean == null)
				throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
			locals.put(name, new Operand(val.value, true));
		} else if (dt != null && dt.unsignedOrSigned != null && dt.width != null) {
			if (val.isBoolean != null)
				throw new IllegalArgumentException("typed numeric assignment requires numeric operand");
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!dt.unsignedOrSigned.equals(val.unsignedOrSigned) || !dt.width.equals(val.width))
					throw new IllegalArgumentException("mismatched typed assignment");
			}
			App.validateRange(val.value.toString(), dt.unsignedOrSigned, dt.width);
			locals.put(name, new Operand(val.value, dt.unsignedOrSigned, dt.width));
		} else {
			locals.put(name, new Operand(val.value, val.unsignedOrSigned, val.width));
		}
		// remove declared type entry now that it's initialized
		declaredTypes.remove(name);
	}
}
