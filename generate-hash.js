import bcrypt from 'bcryptjs';

const password = 'Astafic@2024!Secure';
const hash = bcrypt.hashSync(password, 10);

console.log('Password hash for:', password);
console.log('Hash:', hash);
