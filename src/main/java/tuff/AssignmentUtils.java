package tuff;

import java.util.Map;

final class AssignmentUtils {
	private final Map<String, Operand> locals;
	private final Map<String, Boolean> mutables;

	AssignmentUtils(Map<String, Operand> locals, Map<String, Boolean> mutables) {
		this.locals = locals;
		this.mutables = mutables;
	}

	void assign(String name, Operand val) {
		if (!locals.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
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
}
