#include <iostream>
#include <cstdint>

enum class Status
{
	Ok,
	Err
};
struct Point
{
	int32_t x;
	int32_t y;
};
template <typename T>
struct Container
{
	T value;
	int32_t count;
};
int32_t add(int32_t a, int32_t b);
int32_t multiply(int32_t x, int32_t y);
int32_t negate(int32_t x);
bool is_positive(int32_t x);
int32_t absolute_value(int32_t x);
int32_t max(int32_t a, int32_t b);
int32_t fibonacci(int32_t n);
Point make_point(int32_t x, int32_t y);
int32_t distance_from_origin(Point p);
int32_t point_in_quadrant(Point p);
Point swap_point_coordinates(Point p);
template <typename T>
T generic_identity(T value);
template <typename T>
int32_t generic_pair(T a, T b);
int32_t sum_array(int32_t arr[10]);
int32_t count_to(int32_t n);
int32_t nested_loops();
int32_t conditional_chain(int32_t x);
int32_t pointer_test(const int32_t *p);
void mutable_pointer_test(int32_t *p);
int main()
{
	return 0;
}

int32_t add(int32_t a, int32_t b)
{
	return a + b;
}

int32_t multiply(int32_t x, int32_t y)
{
	return x * y;
}

int32_t negate(int32_t x)
{
	return (-x);
}

bool is_positive(int32_t x)
{
	return x > 0;
}

int32_t absolute_value(int32_t x)
{
	if (is_positive(x))
	{
		x;
	}
	else
	{
		negate(x);
	};
}

int32_t max(int32_t a, int32_t b)
{
	if (a > b)
	{
		a;
	}
	else
	{
		b;
	};
}

int32_t fibonacci(int32_t n)
{
	if (n <= 1)
	{
		n;
	}
	else
	{
		add(fibonacci(add(n, negate(1))), fibonacci(add(n, negate(2))));
	};
}

Point make_point(int32_t x, int32_t y)
{
	return Point{x, y};
}

int32_t distance_from_origin(Point p)
{
	const int32_t x_sq = multiply(p.x, p.x);
	const int32_t y_sq = multiply(p.y, p.y);
	return add(x_sq, y_sq);
}

int32_t point_in_quadrant(Point p)
{
	if (p.x > 0)
	{
		if (p.y > 0)
		{
			1;
		}
		else
		{
			4;
		};
	}
	else
	{
		if (p.y > 0)
		{
			2;
		}
		else
		{
			3;
		};
	};
}

Point swap_point_coordinates(Point p)
{
	return Point{p.y, p.x};
}

template <typename T>
T generic_identity(T value)
{
	return value;
}

template <typename T>
int32_t generic_pair(T a, T b)
{
	return 2;
}

int32_t sum_array(int32_t arr[10])
{
	int32_t sum = 0;
	int32_t i = 0;
	while (i < 3)
	{
		sum = sum + arr[i];
		i = i + 1;
	};
	return sum;
}

int32_t count_to(int32_t n)
{
	int32_t i = 0;
	int32_t result = 0;
	while (true)
	{
		if (i >= n)
		{
			break;
		};
		result = result + i;
		i = i + 1;
	};
	return result;
}

int32_t nested_loops()
{
	int32_t outer = 0;
	int32_t result = 0;
	while (true)
	{
		if (outer >= 3)
		{
			break;
		};
		int32_t inner = 0;
		while (true)
		{
			if (inner >= 2)
			{
				break;
			};
			result = result + 1;
			inner = inner + 1;
		};
		outer = outer + 1;
	};
	return result;
}

int32_t conditional_chain(int32_t x)
{
	if (x < 0)
	{
		0;
	}
	else if (x < 10)
	{
		1;
	}
	else if (x < 20)
	{
		2;
	}
	else
	{
		3;
	};
}

int32_t pointer_test(const int32_t *p)
{
	return *p;
}

void mutable_pointer_test(int32_t *p)
{
	*p = *p + 1;
}
