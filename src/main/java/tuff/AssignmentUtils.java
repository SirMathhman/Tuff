package tuff;

import java.util.Map;

final class AssignmentUtils {
	private final Map<String, Operand> locals;
	private final Map<String, Boolean> mutables;
	private final Map<String, DeclaredType> declaredTypes;

	AssignmentUtils(Map<String, Operand> locals, Map<String, Boolean> mutables,
			Map<String, DeclaredType> declaredTypes) {
		this.locals = locals;
		this.mutables = mutables;
		this.declaredTypes = declaredTypes;
	}

	void assignIndexed(String name, int idx, Operand val) {
		if (idx < 0)
			throw new IllegalArgumentException("index out of bounds");
		if (!locals.containsKey(name)) {
			assignIndexedDeclared(name, idx, val);
		} else {
			assignIndexedExisting(name, idx, val);
		}
	}

	void assignField(String name, String fieldName, Operand val) {
		if (!locals.containsKey(name)) {
			assignFieldDeclared(name, fieldName, val);
		} else {
			assignFieldExisting(name, fieldName, val);
		}
	}

	private void assignFieldDeclared(String name, String fieldName, Operand val) {
		if (!declaredTypes.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		DeclaredType dt = declaredTypes.get(name);
		if (dt == null || !dt.isStruct)
			throw new IllegalArgumentException("attempted field assignment on non-struct: " + name);
		Boolean isMut = mutables.getOrDefault(name, false);
		if (!isMut)
			throw new IllegalArgumentException("assignment to immutable variable: " + name);

		if (!dt.structFields.containsKey(fieldName))
			throw new IllegalArgumentException("unknown field: " + fieldName);

		// build initial struct with zero-initialized fields then assign
		java.util.Map<String, Operand> fmap = new java.util.LinkedHashMap<>();
		for (java.util.Map.Entry<String, DeclaredType> e : dt.structFields.entrySet()) {
			String fn = e.getKey();
			DeclaredType fdt = e.getValue();
			if (fn.equals(fieldName)) {
				// validate and place value
				fmap.put(fn, coerceFieldValue(fdt, val));
			} else {
				// zero-init
				if (fdt.isBool) {
					fmap.put(fn, new Operand(java.math.BigInteger.ZERO, true));
				} else if (fdt.unsignedOrSigned != null && fdt.width != null) {
					fmap.put(fn, new Operand(java.math.BigInteger.ZERO, fdt.unsignedOrSigned, fdt.width));
				} else if (fdt.isArray) {
					fmap.put(fn, new Operand(new java.util.ArrayList<>()));
				} else {
					fmap.put(fn, new Operand(java.math.BigInteger.ZERO, null, null));
				}
			}
		}

		locals.put(name, new Operand(fmap));
		declaredTypes.remove(name);
	}

	private void assignFieldExisting(String name, String fieldName, Operand val) {
		if (!locals.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		Operand obj = locals.get(name);
		if (obj.structFields == null)
			throw new IllegalArgumentException("attempted field assignment on non-struct: " + name);
		Boolean isMut = mutables.getOrDefault(name, false);
		if (!isMut)
			throw new IllegalArgumentException("assignment to immutable variable: " + name);
		if (!obj.structFields.containsKey(fieldName))
			throw new IllegalArgumentException("unknown field: " + fieldName);
		// basic validation: if existing field has typed info, enforce
		Operand oldField = obj.structFields.get(fieldName);
		if (oldField.isBoolean != null && val.isBoolean == null)
			throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
		if (oldField.isBoolean == null && val.isBoolean != null)
			throw new IllegalArgumentException("typed numeric assignment requires numeric operand");

		if (oldField.unsignedOrSigned != null && oldField.width != null) {
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!oldField.unsignedOrSigned.equals(val.unsignedOrSigned) || !oldField.width.equals(val.width))
					throw new IllegalArgumentException("mismatched typed assignment");
			}
			App.validateRange(val.value.toString(), oldField.unsignedOrSigned, oldField.width);
			obj.structFields.put(fieldName, new Operand(val.value, oldField.unsignedOrSigned, oldField.width));
		} else {
			obj.structFields.put(fieldName, new Operand(val.value, val.unsignedOrSigned, val.width));
		}
		locals.put(name, obj);
	}

	private Operand coerceFieldValue(DeclaredType fdt, Operand val) {
		if (fdt.isBool) {
			if (val.isBoolean == null)
				throw new IllegalArgumentException("typed Bool field assignment requires boolean operand");
			return new Operand(val.value, true);
		}
		if (fdt.unsignedOrSigned != null && fdt.width != null) {
			if (val.isBoolean != null)
				throw new IllegalArgumentException("typed numeric field assignment requires numeric operand");
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!fdt.unsignedOrSigned.equals(val.unsignedOrSigned) || !fdt.width.equals(val.width))
					throw new IllegalArgumentException("mismatched typed assignment");
			}
			App.validateRange(val.value.toString(), fdt.unsignedOrSigned, fdt.width);
			return new Operand(val.value, fdt.unsignedOrSigned, fdt.width);
		}
		return new Operand(val.value, val.unsignedOrSigned, val.width);
	}

	private void assignIndexedDeclared(String name, int idx, Operand val) {
		if (!declaredTypes.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		DeclaredType dt = declaredTypes.get(name);
		if (dt == null || !dt.isArray)
			throw new IllegalArgumentException("attempted indexing on non-array: " + name);
		Boolean isMut = mutables.getOrDefault(name, false);
		if (!isMut)
			throw new IllegalArgumentException("assignment to immutable variable: " + name);
		int capacity = dt.arrayCapacity != null ? dt.arrayCapacity : (dt.arrayLength != null ? dt.arrayLength : 0);
		if (idx >= capacity)
			throw new IllegalArgumentException("index out of bounds");

		java.util.List<Operand> elems = buildDeclaredArrayForIndex(dt, idx);
		applyValueToArraySlotDeclared(dt, elems, new java.util.AbstractMap.SimpleEntry<>(idx, val));

		DeclaredType runtimeDt = new DeclaredType();
		runtimeDt.arrayCapacity = capacity;
		runtimeDt.elemIsBool = dt.elemIsBool;
		runtimeDt.elemUnsignedOrSigned = dt.elemUnsignedOrSigned;
		runtimeDt.elemWidth = dt.elemWidth;
		locals.put(name, new Operand(elems, runtimeDt));
		declaredTypes.remove(name);
	}

	private java.util.List<Operand> buildDeclaredArrayForIndex(DeclaredType dt, int idx) {
		java.util.List<Operand> elems = new java.util.ArrayList<>();
		int initial = dt.arrayLength != null ? dt.arrayLength : 0;
		for (int k = 0; k < initial; k++) {
			if (dt.elemIsBool) {
				elems.add(new Operand(java.math.BigInteger.ZERO, true));
			} else if (dt.elemUnsignedOrSigned != null && dt.elemWidth != null) {
				elems.add(new Operand(java.math.BigInteger.ZERO, dt.elemUnsignedOrSigned, dt.elemWidth));
			} else {
				elems.add(new Operand(java.math.BigInteger.ZERO, null, null));
			}
		}
		while (elems.size() <= idx) {
			if (dt.elemIsBool) {
				elems.add(new Operand(java.math.BigInteger.ZERO, true));
			} else if (dt.elemUnsignedOrSigned != null && dt.elemWidth != null) {
				elems.add(new Operand(java.math.BigInteger.ZERO, dt.elemUnsignedOrSigned, dt.elemWidth));
			} else {
				elems.add(new Operand(java.math.BigInteger.ZERO, null, null));
			}
		}
		return elems;
	}

	private void applyValueToArraySlotDeclared(DeclaredType dt, java.util.List<Operand> elems,
			java.util.Map.Entry<Integer, Operand> assignment) {
		int idx = assignment.getKey();
		Operand val = assignment.getValue();
		if (dt.elemIsBool) {
			if (val.isBoolean == null)
				throw new IllegalArgumentException("typed Bool array requires boolean elements");
			elems.set(idx, new Operand(val.value, true));
			return;
		}
		if (val.isBoolean != null)
			throw new IllegalArgumentException("typed numeric array requires numeric elements");
		if (dt.elemUnsignedOrSigned != null && dt.elemWidth != null) {
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!dt.elemUnsignedOrSigned.equals(val.unsignedOrSigned) || !dt.elemWidth.equals(val.width))
					throw new IllegalArgumentException("mismatched typed array element assignment");
			}
			App.validateRange(val.value.toString(), dt.elemUnsignedOrSigned, dt.elemWidth);
			elems.set(idx, new Operand(val.value, dt.elemUnsignedOrSigned, dt.elemWidth));
			return;
		}
		elems.set(idx, new Operand(val.value, val.unsignedOrSigned, val.width));
	}

	private void assignIndexedExisting(String name, int idx, Operand val) {
		Operand arr = locals.get(name);
		if (arr.elements == null)
			throw new IllegalArgumentException("attempted indexing on non-array: " + name);
		Boolean isMut = mutables.getOrDefault(name, false);
		if (!isMut)
			throw new IllegalArgumentException("assignment to immutable variable: " + name);
		Integer capacity = arr.arrayCapacity;
		if (capacity != null && idx >= capacity)
			throw new IllegalArgumentException("index out of bounds");
		java.util.List<Operand> elems = expandExistingArrayToIndex(arr, idx);
		applyValueToArraySlotExisting(arr, elems, new java.util.AbstractMap.SimpleEntry<>(idx, val));
		DeclaredType runtimeDt = new DeclaredType();
		runtimeDt.arrayCapacity = capacity;
		runtimeDt.elemIsBool = arr.elemIsBool;
		runtimeDt.elemUnsignedOrSigned = arr.elemUnsignedOrSigned;
		runtimeDt.elemWidth = arr.elemWidth;
		locals.put(name, new Operand(elems, runtimeDt));
	}

	private java.util.List<Operand> expandExistingArrayToIndex(Operand arr, int idx) {
		java.util.List<Operand> elems = arr.elements;
		while (elems.size() <= idx) {
			if (arr.elemIsBool) {
				elems.add(new Operand(java.math.BigInteger.ZERO, true));
			} else if (arr.elemUnsignedOrSigned != null && arr.elemWidth != null) {
				elems.add(new Operand(java.math.BigInteger.ZERO, arr.elemUnsignedOrSigned, arr.elemWidth));
			} else {
				elems.add(new Operand(java.math.BigInteger.ZERO, null, null));
			}
		}
		return elems;
	}

	private void applyValueToArraySlotExisting(Operand arr, java.util.List<Operand> elems,
			java.util.Map.Entry<Integer, Operand> assignment) {
		int idx = assignment.getKey();
		Operand val = assignment.getValue();
		if (arr.elemIsBool) {
			if (val.isBoolean == null)
				throw new IllegalArgumentException("typed Bool array requires boolean elements");
			elems.set(idx, new Operand(val.value, true));
			return;
		}
		if (val.isBoolean != null)
			throw new IllegalArgumentException("typed numeric array requires numeric elements");
		if (arr.elemUnsignedOrSigned != null && arr.elemWidth != null) {
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!arr.elemUnsignedOrSigned.equals(val.unsignedOrSigned) || !arr.elemWidth.equals(val.width))
					throw new IllegalArgumentException("mismatched typed array element assignment");
			}
			App.validateRange(val.value.toString(), arr.elemUnsignedOrSigned, arr.elemWidth);
			elems.set(idx, new Operand(val.value, arr.elemUnsignedOrSigned, arr.elemWidth));
			return;
		}
		elems.set(idx, new Operand(val.value, val.unsignedOrSigned, val.width));
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
			// allow reassigning function values
			if (old.functionRef != null && val.functionRef == null)
				throw new IllegalArgumentException("typed function assignment requires function operand");

			locals.put(name, new Operand(val.value, val.unsignedOrSigned, val.width));
		}
	}

	private void assignDeclaredUninitialized(String name, Operand val) {
		DeclaredType dt = declaredTypes.get(name);
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
		} else if (dt != null && dt.isFunction) {
			if (val.functionRef == null)
				throw new IllegalArgumentException("typed function assignment requires function operand");
			// basic arity check
			java.util.List<DeclaredType> expected = dt.functionParamTypes != null ? dt.functionParamTypes
					: new java.util.ArrayList<>();
			java.util.List<DeclaredType> actual = val.functionRef.signature.paramTypes != null
					? val.functionRef.signature.paramTypes
					: new java.util.ArrayList<>();
			if (expected.size() != actual.size())
				throw new IllegalArgumentException("mismatched function type in assignment");
			locals.put(name, new Operand(val.functionRef, val.functionName));
		} else {
			locals.put(name, new Operand(val.value, val.unsignedOrSigned, val.width));
		}
		// remove declared type entry now that it's initialized
		declaredTypes.remove(name);
	}

	void assignCompound(String name, char op, Operand val) {
		if (!locals.containsKey(name)) {
			assignCompoundUninitialized(name, op, val);
		} else {
			assignCompoundExisting(name, op, val);
		}
	}

	private void assignCompoundUninitialized(String name, char op, Operand val) {
		if (!declaredTypes.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		DeclaredType dt = declaredTypes.get(name);
		Operand old = dt != null && dt.isBool
				? new Operand(java.math.BigInteger.ZERO, true)
				: new Operand(java.math.BigInteger.ZERO, dt != null ? dt.unsignedOrSigned : null,
						dt != null ? dt.width : null);
		if (old.isBoolean != null || val.isBoolean != null)
			throw new IllegalArgumentException("compound assignment requires numeric operands");
		java.math.BigInteger newVal = App.computeBinaryOp(old.value, val.value, String.valueOf(op));
		if (dt != null && dt.unsignedOrSigned != null && dt.width != null) {
			App.validateRange(newVal.toString(), dt.unsignedOrSigned, dt.width);
			locals.put(name, new Operand(newVal, dt.unsignedOrSigned, dt.width));
		} else {
			locals.put(name, new Operand(newVal, val.unsignedOrSigned, val.width));
		}
		declaredTypes.remove(name);
	}

	private void assignCompoundExisting(String name, char op, Operand val) {
		Boolean isMut = mutables.getOrDefault(name, false);
		if (!isMut)
			throw new IllegalArgumentException("assignment to immutable variable: " + name);
		Operand old = locals.get(name);
		if (old.isBoolean != null || val.isBoolean != null)
			throw new IllegalArgumentException("compound assignment requires numeric operands");
		java.math.BigInteger result = App.computeBinaryOp(old.value, val.value, String.valueOf(op));
		if (old.unsignedOrSigned != null && old.width != null) {
			if (val.unsignedOrSigned != null && val.width != null) {
				if (!old.unsignedOrSigned.equals(val.unsignedOrSigned) || !old.width.equals(val.width))
					throw new IllegalArgumentException("mismatched typed assignment");
			}
			App.validateRange(result.toString(), old.unsignedOrSigned, old.width);
			locals.put(name, new Operand(result, old.unsignedOrSigned, old.width));
		} else {
			locals.put(name, new Operand(result, val.unsignedOrSigned, val.width));
		}
	}
}
