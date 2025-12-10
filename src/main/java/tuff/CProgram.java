package tuff;

public record CProgram(int value) implements CNode {
	@Override
	public String display() {
		return Integer.toString(value);
	}
}
