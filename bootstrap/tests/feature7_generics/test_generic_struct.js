;
function main() {
  const b1 = { value: 10 };
  const b2 = { value: true };
  if (b2.value) {
  return b1.value;
} else {
  return 0;
};
};
process.exit(main());
