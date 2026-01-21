package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.lib.ArrayList;

public record StructDefinition(String name, ArrayList<StructHandler.StructField> fields) {
	public StructHandler.StructField getField(String fieldName) {
		for (var field : fields) {
			if (field.name().equals(fieldName)) {
				return field;
			}
		}
		return null;
	}

	public int getFieldIndex(String fieldName) {
		for (var i = 0; i < fields.size(); i++) {
			if (fields.get(i).name().equals(fieldName)) {
				return i;
			}
		}
		return -1;
	}
}
