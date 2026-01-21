package io.github.sirmathhman.tuff.lib;

import io.github.sirmathhman.tuff.vm.Instruction;

import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public record ArrayList<T>(List<T> list) implements Iterable<T> {
	public ArrayList() {
		this(new java.util.ArrayList<>());
	}

	public ArrayList(ArrayList<T> copy) {
		this(new java.util.ArrayList<>(copy.list));
	}

	public int size() {
		return list.size();
	}

	public T get(int index) {
		return list.get(index);
	}

	@Override
	public Iterator<T> iterator() {
		return list.iterator();
	}

	public void add(T element) {
		list.add(element);
	}

	public void set(int index, T element) {
		list.set(index, element);
	}

	public void addAll(ArrayList<T> code) {
		list.addAll(code.list);
	}

	public int indexOf(T index) {
		return list.indexOf(index);
	}

	public boolean isEmpty() {
		return list.isEmpty();
	}

	public Stream<T> stream() {
		return list.stream();
	}

	public ArrayList<T> subList(int start, int end) {
		return new ArrayList<>(list.subList(start, end));
	}

	public Instruction[] toArray(Instruction[] instructions) {
		return list.toArray(instructions);
	}
}
