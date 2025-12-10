package com.example.tuff;

public class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff Maven project!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	public static String greet(String name) {
		return "Hello, " + name + "!";
	}
}
