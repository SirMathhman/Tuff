package tuff;

public record TuffInteger(int value) implements TuffNode {
	@Override
	public String display() {
		return Integer.toString(value);
	}
}
