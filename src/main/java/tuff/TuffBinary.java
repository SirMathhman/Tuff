package tuff;

public record TuffBinary(TuffNode left, String op, TuffNode right) implements TuffNode {
	@Override
	public String display() {
		return left.display() + " " + op + " " + right.display();
	}
}
