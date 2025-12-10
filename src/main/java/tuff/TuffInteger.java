package tuff;

public record TuffInteger(int value, String type) implements TuffNode {
	@Override
	public String display() {
		if (type == null || type.isEmpty())
			return Integer.toString(value);
		return Integer.toString(value) + type;
	}
}
