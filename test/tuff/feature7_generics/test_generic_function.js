function identity(x) {
  return x;
};
function main() {
  const a = identity(10);
  const b = identity(true);
  if (b) {
  return a;
} else {
  return 0;
};
};
process.exit(main());
