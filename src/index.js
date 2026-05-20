function main() {
  console.log("Hello from Tuff!");
}

module.exports = { main };

if (require.main === module) {
  main();
}
