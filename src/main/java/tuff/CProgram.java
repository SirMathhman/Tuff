package tuff;

import java.math.BigInteger;

public record CProgram(BigInteger value, String type) implements CNode {
	@Override
	public String display() {
		final var s = value.toString();
		if (type == null || type.isEmpty())
			return s;
		return s + type;
	}
}
