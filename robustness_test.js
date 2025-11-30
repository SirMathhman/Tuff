;
;
const Status = { Ok: 0, Err: 1 };
function add(a, b) {
  return (a + b);
};
function multiply(x, y) {
  return (x * y);
};
function negate(x) {
  return (-x);
};
function is_positive(x) {
  return (x > 0);
};
function absolute_value(x) {
  if (is_positive(x)) {
  x;
} else {
  negate(x);
};
};
function max(a, b) {
  if ((a > b)) {
  a;
} else {
  b;
};
};
function fibonacci(n) {
  if ((n <= 1)) {
  n;
} else {
  add(fibonacci(add(n, negate(1))), fibonacci(add(n, negate(2))));
};
};
function make_point(x, y) {
  return { x: x, y: y };
};
function distance_from_origin(p) {
  const x_sq = multiply(p.x, p.x);
  const y_sq = multiply(p.y, p.y);
  return add(x_sq, y_sq);
};
function point_in_quadrant(p) {
  if ((p.x > 0)) {
  if ((p.y > 0)) {
  1;
} else {
  4;
};
} else {
  if ((p.y > 0)) {
  2;
} else {
  3;
};
};
};
function swap_point_coordinates(p) {
  return { x: p.y, y: p.x };
};
function generic_identity(value) {
  return value;
};
function generic_pair(a, b) {
  return 2;
};
function sum_array(arr) {
  let sum = 0;
  let i = 0;
  while ((i < 3)) {
  sum = (sum + arr[i]);
  i = (i + 1);
};
  return sum;
};
function count_to(n) {
  let i = 0;
  let result = 0;
  while (true) {
  if ((i >= n)) {
  break;
};
  result = (result + i);
  i = (i + 1);
};
  return result;
};
function nested_loops() {
  let outer = 0;
  let result = 0;
  while (true) {
  if ((outer >= 3)) {
  break;
};
  let inner = 0;
  while (true) {
  if ((inner >= 2)) {
  break;
};
  result = (result + 1);
  inner = (inner + 1);
};
  outer = (outer + 1);
};
  return result;
};
function conditional_chain(x) {
  if ((x < 0)) {
  0;
} else if ((x < 10)) {
  1;
} else if ((x < 20)) {
  2;
} else {
  3;
};
};
function pointer_test(p) {
  return p;
};
function mutable_pointer_test(p) {
  p.set((p.ptr() + 1));
};
function main() {
  const p1 = make_point(3, 4);
  const p2 = make_point((-2), 5);
  const p3 = swap_point_coordinates(p1);
  const sum1 = add(10, 20);
  const sum2 = add(sum1, add(5, 5));
  const prod = multiply(sum2, 2);
  const abs_neg = absolute_value(negate(15));
  const max_val = max(42, 100);
  const fib5 = fibonacci(5);
  const dist = distance_from_origin(p1);
  const quad = point_in_quadrant(p2);
  const quad_swap = point_in_quadrant(p3);
  const id_val = generic_identity(99);
  const pair_count = generic_pair(1, 2);
  const arr = [1, 2, 3, 0, 0, 0, 0, 0, 0, 0];
  const arr_sum = sum_array(arr);
  const count_result = count_to(5);
  const nested = nested_loops();
  const cond1 = conditional_chain(negate(1));
  const cond2 = conditional_chain(5);
  const cond3 = conditional_chain(15);
  const cond4 = conditional_chain(50);
  const ptr_val = pointer_test(42);
  let mutable_val = 50;
  mutable_pointer_test({ptr: () => mutable_val, set: (v) => mutable_val = v});
  const final_result = add(add(prod, fib5), add(arr_sum, nested));
  return final_result;
};
