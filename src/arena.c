#include "arena.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct Block
{
	struct Block *next;
	size_t capacity;
	size_t used;
	char data[];
} Block;

struct Arena
{
	Block *head;
	size_t default_capacity;
	size_t total_allocated;
	size_t total_freed;
};

static struct Arena global_arena = {0};

void arena_init(size_t capacity)
{
	global_arena.head = NULL;
	global_arena.default_capacity = capacity > 0 ? capacity : 4096;
	global_arena.total_allocated = 0;
	global_arena.total_freed = 0;
}

static Block *block_create(size_t capacity)
{
	Block *block = malloc(sizeof(Block) + capacity);
	if (!block)
		return NULL;

	block->next = NULL;
	block->capacity = capacity;
	block->used = 0;
	return block;
}

void *arena_alloc(size_t size)
{
	if (size == 0)
		return NULL;

	/* Align to 8 bytes */
	size = (size + 7) & ~7;

	/* Try current block */
	if (global_arena.head && global_arena.head->used + size <= global_arena.head->capacity)
	{
		void *ptr = global_arena.head->data + global_arena.head->used;
		global_arena.head->used += size;
		global_arena.total_allocated += size;
		return ptr;
	}

	/* Need new block */
	size_t block_size = size > global_arena.default_capacity ? size : global_arena.default_capacity;
	Block *new_block = block_create(block_size);
	if (!new_block)
		return NULL;

	new_block->next = global_arena.head;
	global_arena.head = new_block;

	void *ptr = new_block->data;
	new_block->used = size;
	global_arena.total_allocated += size;
	return ptr;
}

void arena_free(void *ptr, size_t size)
{
	if (!ptr || size == 0)
		return;

	/* Align to 8 bytes (same as arena_alloc) */
	size = (size + 7) & ~7;
	global_arena.total_freed += size;
}

void arena_cleanup(void)
{
	/* Check for memory leaks */
	if (global_arena.total_allocated != global_arena.total_freed)
	{
		fprintf(stderr, "Arena leak detected: %zu bytes allocated, %zu bytes freed\n",
						global_arena.total_allocated, global_arena.total_freed);
		abort();
	}

	Block *block = global_arena.head;
	while (block)
	{
		Block *next = block->next;
		free(block);
		block = next;
	}

	/* Reset global arena */
	global_arena.head = NULL;
	global_arena.total_allocated = 0;
	global_arena.total_freed = 0;
}
