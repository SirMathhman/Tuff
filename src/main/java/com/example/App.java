package com.example;

public class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	/**
	 * Interpret the given string and return an int.
	 * Current implementation parses decimal integers.
	 */
	public static int interpret(String input) {
		return Integer.parseInt(input);
	}
}