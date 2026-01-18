const s = 'x';
const regex = new RegExp(`\\bx\\b`, 'g');
console.log('String:', s);
console.log('Regex:', regex);
console.log('Result:', s.replace(regex, '3'));
