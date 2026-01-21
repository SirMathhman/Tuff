package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.List;

public record StructDefinition(String name, List<StructHandler.StructField> fields) {
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
