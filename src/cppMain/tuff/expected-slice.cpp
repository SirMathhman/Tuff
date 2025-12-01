// This depends if void* is stack or heap allocated.
void dropPointer(void*);

template <typename T>
struct Slice
{
	T *pointer;
	size_t init;
	size_t length;
};

template <typename T>
T *get(Slice<T> *slice, size_t index)
{
	return slice->pointer + index;
}

template <typename T>
void set(Slice<T> *slice, size_t index, T value)
{
	slice->pointer[index] = value;
	if (index + 1 > slice->init)
	{
		slice->init = index + 1;
	}
}

/*
At a call site, we will have to invoke
*/

// This should only apply IF T : ~ (T has a destructor).
// otherwise don't invoke this.
template <typename T>
void dropPointer(Slice<T> *slice)
{
	for (size_t i = 0; i < slice->init; i++)
	{
		slice->pointer[i].drop();
	}
}

template <typename T>
void drop(Slice<T> *slice)
{
	dropPointer(slice->pointer);
}