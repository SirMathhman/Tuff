package tuff;

import java.math.BigInteger;

public record TuffInteger(BigInteger value, String type) implements TuffNode {
	@Override
	public String display() {
		final var s = value.toString();
		if (type == null || type.isEmpty())
			return s;
		return s + type;
	}
}
