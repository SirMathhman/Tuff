package com.tuff

/**
 * A single variable binding.
 *
 * @param name the bound identifier.
 * @param value the current integer value (for a reference binding, the value at bind time).
 * @param mutable whether the binding may be reassigned via `x = ...`.
 * @param refTarget if this binding was created from a reference expression (`&x` / `&mut x`),
 *   the name of the variable it points to; otherwise `null`.
 * @param refMutable whether the reference was formed with `&mut` (allows write-through `*y = ...`).
 */
data class Binding(
    val name: String,
    val value: Int,
    val mutable: Boolean,
    val refTarget: String? = null,
    val refMutable: Boolean = false
)

/**
 * A scope chain of variable bindings. Lookup walks from the innermost frame outward.
 * A single frame behaves like a flat map; [enter]/[exit] support block scoping.
 */
class Scope {
    private val frames = ArrayDeque<MutableMap<String, Binding>>()

    init {
        frames.addLast(mutableMapOf())
    }

    private val current: MutableMap<String, Binding> get() = frames.last()

    fun lookup(name: String): Binding? {
        for (frame in frames.asReversed()) {
            frame[name]?.let { return it }
        }
        return null
    }

    fun bind(binding: Binding) {
        current[binding.name] = binding
    }

    fun assign(name: String, value: Int) {
        for (frame in frames.asReversed()) {
            val existing = frame[name]
            if (existing != null) {
                frame[name] = existing.copy(value = value)
                return
            }
        }
    }

    fun enter() {
        frames.addLast(mutableMapOf())
    }

    fun exit() {
        frames.removeLast()
    }
}
