#ifndef ARENA_H
#define ARENA_H

#include <stddef.h>

/*
 * Initialize the global arena with the specified initial capacity.
 */
void arena_init(size_t capacity);

/*
 * Allocate memory from the global arena. Returns NULL on failure.
 */
void *arena_alloc(size_t size);

/*
 * Mark memory as freed (for leak tracking). The memory is not actually
 * freed until arena_cleanup is called.
 */
void arena_free(void *ptr, size_t size);

/*
 * Free all memory associated with the global arena.
 * Aborts if there are unfreed allocations.
 */
void arena_cleanup(void);

#endif /* ARENA_H */
